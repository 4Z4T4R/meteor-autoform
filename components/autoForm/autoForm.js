/* global AutoForm, getFormValues, ReactiveVar, arrayTracker, Hooks, MongoObject, updateAllTrackedFieldValues, formValues */

Template.autoForm.helpers({
  atts: function autoFormTplAtts() {
    // After removing all of the props we know about, everything else should
    // become a form attribute unless it's an array or object.
    var val, htmlAttributes = {}, context = this;
    var removeProps = [
      "schema",
      "collection",
      "validation",
      "doc",
      "resetOnSuccess",
      "type",
      "template",
      "autosave",
      "meteormethod",
      "filter",
      "autoConvert",
      "removeEmptyStrings",
      "trimStrings"
    ];

    // Filter out arrays and objects, which are obviously not meant to be
    // HTML attributes.
    for (var prop in context) {
      if (context.hasOwnProperty(prop) && !_.contains(removeProps, prop)) {
        val = context[prop];
        if (!_.isArray(val) && !_.isObject(val)) {
          htmlAttributes[prop] = val;
        }
      }
    }

    // By default, we add the `novalidate="novalidate"` attribute to our form,
    // unless the user passes `validation="browser"`.
    if (this.validation !== "browser" && !htmlAttributes.novalidate) {
      htmlAttributes.novalidate = "novalidate";
    }

    return htmlAttributes;
  },
  innerContext: function autoFormTplContext(outerContext) {
    // Set up the context to be used for everything within the autoform.
    // TODO we don't need this anymore if we redo the AutoForm.findAttributesWithPrefix
    // function, which still searches for `_af` in the data context.
    var innerContext = {_af: {}};

    // Preserve outer context, allowing access within autoForm block without needing ..
    _.extend(innerContext, outerContext);

    return innerContext;
  },
  afDestroyUpdateForm: function (formId) {
    AutoForm._destroyForm[formId] = AutoForm._destroyForm[formId] || new ReactiveVar(false);
    return AutoForm._destroyForm[formId].get();
  }
});

Template.autoForm.created = function autoFormCreated() {
  var template = this;

  template.autorun(function (c) {
    var data = Template.currentData(); // rerun when current data changes
    var formId = data.id;

    // When we change the form, loading a different doc, reloading the current doc, etc.,
    // we also want to reset the array counts for the form
    arrayTracker.resetForm(formId);

    var ss = AutoForm.getFormSchema(formId, data);

    // Clone the doc so that docToForm and other modifications do not change
    // the original referenced object.
    var doc = data.doc ? EJSON.clone(data.doc) : null;

    // Update cached form values for hot code reload persistence
    if (data.preserveForm === false) {
      AutoForm.formPreserve.unregisterForm(formId);
    } else {
      // Even if we have already registered, we reregister to ensure that the
      // closure values of template, formId, and ss remain correct after each
      // reaction
      AutoForm.formPreserve.registerForm(formId, function autoFormRegFormCallback() {
        return getFormValues(template, formId, ss).insertDoc;
      });
    }

    // Retain doc values after a "hot code push", if possible
    if (c.firstRun) {
      var retrievedDoc = AutoForm.formPreserve.getDocument(formId);
      if (retrievedDoc !== false) {
        // Ensure we keep the _id property which may not be present in retrievedDoc.
        doc = _.extend(doc || {}, retrievedDoc);
      }
    }

    var mDoc;
    if (doc && !_.isEmpty(doc)) {
      var hookCtx = {formId: formId};
      // Pass doc through docToForm hooks
      _.each(Hooks.getHooks(formId, 'docToForm'), function autoFormEachDocToForm(hook) {
        doc = hook.call(hookCtx, doc, ss, formId);
        if (!doc) {
          throw new Error('Oops! Did you forget to return the modified document from your docToForm hook for the ' + formId + ' form?');
        }
      });
      // Create a "flat doc" that can be used to easily get values for corresponding
      // form fields.
      mDoc = new MongoObject(doc);
      AutoForm.reactiveFormData.sourceDoc(formId, mDoc);
    } else {
      AutoForm.reactiveFormData.sourceDoc(formId, null);
    }

    // This ensures that anything dependent on field values will properly
    // react to field values set from the database document. That is,
    // computations dependent on AutoForm.getFieldValue will rerun properly
    // when the form is initially rendered using values from `doc`.
    setTimeout(function () {
      updateAllTrackedFieldValues(formId);
    }, 0);
  });
};

Template.autoForm.destroyed = function autoFormDestroyed() {
  var self = this;
  var formId = self.data.id;

  // TODO if formId was changing reactively during life of instance,
  // some data won't be removed by the calls below.

  // Remove from array fields list
  arrayTracker.untrackForm(formId);

  // Remove from field values
  if (formValues[formId]) {
    delete formValues[formId];
  }

  // Unregister form preservation
  AutoForm.formPreserve.unregisterForm(formId);
};
