/* global _validateForm:true, AutoForm, getFormValues, validateField:true, getAllFieldsInForm */

/*
 * all form validation logic is here
 */

_validateForm = function _validateForm(formId, formDocs, useCollectionSchema) {
  var form = AutoForm.getCurrentDataForForm(formId);
  var formType = form.type;

  if (form.validation === 'none') {
    return true;
  }

  // Call onSubmit from the requested form type definition
  var ftd = AutoForm._formTypeDefinitions[formType];
  if (!ftd) {
    throw new Error('AutoForm: Form type "' + formType + '" has not been defined');
  }

  return ftd.validateForm.call({
    form: form,
    formDocs: formDocs,
    useCollectionSchema: useCollectionSchema
  });
};

function _validateField(key, formId, skipEmpty, onlyIfAlreadyInvalid) {
  var docToValidate, isModifier;

  // Due to throttling, this can be called after the autoForm template is destroyed.
  // If that happens, we exit without error.
  var template = AutoForm.templateInstanceForForm(formId);
  if (!template || !template.view._domrange || template.view.isDestroyed) {
    return;
  }

  var form = AutoForm.getCurrentDataForForm(formId);
  var ss = AutoForm.getFormSchema(formId);

  if (!ss) {
    return;
  }

  // Skip validation if onlyIfAlreadyInvalid is true and the form is
  // currently valid.
  if (onlyIfAlreadyInvalid && ss.namedContext(formId).isValid()) {
    return; //skip validation
  }

  // Create a document based on all the values of all the inputs on the form
  var formDocs = getFormValues(template, formId, ss);

  // Clean and validate doc
  if (form.type === "update" || form.type === "method-update") {
    docToValidate = formDocs.updateDoc;
    isModifier = true;
  } else {
    docToValidate = formDocs.insertDoc;
    isModifier = false;
  }

  // Skip validation if skipEmpty is true and the field we're validating
  // has no value.
  if (skipEmpty && !AutoForm.Utility.objAffectsKey(docToValidate, key)) {
    return true; //skip validation
  }

  return validateFormDoc(docToValidate, isModifier, formId, ss, form, key);
}

// Throttle field validation to occur at most every 300ms,
// with leading and trailing calls.
validateField = _.throttle(_validateField, 300);

validateFormDoc = function validateFormDoc(doc, isModifier, formId, ss, form, key) {
  var isValid;
  var ec = {
    userId: (Meteor.userId && Meteor.userId()) || null,
    isInsert: !isModifier,
    isUpdate: !!isModifier,
    isUpsert: false,
    isFromTrustedCode: false,
    docId: (form.doc && form.doc._id) || null
  };

  // Get a version of the doc that has auto values to validate here. We
  // don't want to actually send any auto values to the server because
  // we ultimately want them generated on the server
  var docForValidation = _.clone(doc);
  ss.clean(docForValidation, {
    isModifier: isModifier,
    filter: false,
    autoConvert: false,
    trimStrings: false,
    extendAutoValueContext: ec
  });

  // Validate
  // If `key` is provided, we validate that key/field only
  if (key) {
    isValid = ss.namedContext(formId).validateOne(docForValidation, key, {
      modifier: isModifier,
      extendedCustomContext: ec
    });
  } else {
    isValid = ss.namedContext(formId).validate(docForValidation, {
      modifier: isModifier,
      extendedCustomContext: ec
    });

    if (!isValid) {
      selectFirstInvalidField(formId, ss);
    }
  }

  return isValid;
};

/*
 * PRIVATE
 */

// Selects the focus the first field with an error
function selectFirstInvalidField(formId, ss) {
  var ctx = ss.namedContext(formId), template, fields;
  if (!ctx.isValid()) {
    template = AutoForm.templateInstanceForForm(formId);
    fields = getAllFieldsInForm(template);
    fields.each(function () {
      var f = $(this);
      if (ctx.keyIsInvalid(f.attr('data-schema-key'))) {
        f.focus();
        return false;
      }
    });
  }
}
