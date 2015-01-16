// all form events handled here
var lastAutoSaveElement = null;

function beginSubmit(formId, template, hookContext) {
  if (!template || !template.view._domrange || template.view.isDestroyed) {
    return;
  }

  // Get user-defined hooks
  var hooks = Hooks.getHooks(formId, 'beginSubmit');
  if (hooks.length) {
    _.each(hooks, function beginSubmitHooks(hook) {
      hook.call(hookContext, formId, template);
    });
  } else {
    // If there are no user-defined hooks, by default we disable the submit button during submission
    var submitButton = template.find("button[type=submit]") || template.find("input[type=submit]");
    if (submitButton) {
      submitButton.disabled = true;
    }
  }
}

function endSubmit(formId, template, hookContext) {
  if (!template || !template.view._domrange || template.view.isDestroyed) {
    return;
  }

  // Try to avoid incorrect reporting of which input caused autosave
  lastAutoSaveElement = null;
  // Get user-defined hooks
  var hooks = Hooks.getHooks(formId, 'endSubmit');
  if (hooks.length) {
    _.each(hooks, function endSubmitHooks(hook) {
      hook.call(hookContext, formId, template);
    });
  } else {
    // If there are no user-defined hooks, by default we disable the submit button during submission
    var submitButton = template.find("button[type=submit]") || template.find("input[type=submit]");
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

Template.autoForm.events({
  'submit form': function autoFormSubmitHandler(event, template) {
    // Gather necessary form info
    var formId = this.id;
    var form = AutoForm.getCurrentDataForForm(formId);
    var isInsert = (form.type === "insert");
    var isUpdate = (form.type === "update");
    var isMethod = (form.type === "method");
    var method = form.meteormethod;
    var isNormalSubmit = (!isInsert && !isUpdate && !isMethod);
    // ss will be the schema for the `schema` attribute if present,
    // else the schema for the collection
    var ss = AutoForm.getFormSchema(formId);
    var collection = AutoForm.getFormCollection(formId);
    var ssIsOverride = !!(collection && form.schema);

    var currentDoc = form.doc;
    var docId = currentDoc ? currentDoc._id : null;
    var isValid;

    // Make sure we have a collection if we need one for the requested submit type
    if (!collection) {
      if (isInsert)
        throw new Error("AutoForm: You must specify a collection when form type is insert.");
      else if (isUpdate)
        throw new Error("AutoForm: You must specify a collection when form type is update.");
    }

    // Prevent browser form submission if we're planning to do our own thing
    if (!isNormalSubmit) {
      event.preventDefault();
    }

    // Gather hooks
    var onSuccess = Hooks.getHooks(formId, 'onSuccess');
    var onError = Hooks.getHooks(formId, 'onError');

    // Prep context with which hooks are called
    var hookContext = {
      event: event,
      template: template,
      formId: formId,
      docId: docId,
      autoSaveChangedElement: lastAutoSaveElement,
      resetForm: function () {
        AutoForm.resetForm(formId, template);
      },
      validationContext: AutoForm.getValidationContext(formId)
    };

    // Prep haltSubmission function
    function haltSubmission() {
      event.preventDefault();
      event.stopPropagation();
      // Run endSubmit hooks (re-enabled submit button or form, etc.)
      endSubmit(formId, template, hookContext);
    }

    function failedValidation() {
      var ec = ss.namedContext(formId);
      var ik = ec.invalidKeys(), error;
      if (ik) {
        if (ik.length) {
          // We add `message` prop to the invalidKeys.
          // Maybe SS pkg should just add that property back in?
          ik = _.map(ik, function (o) {
            return _.extend({message: ec.keyErrorMessage(o.name)}, o);
          });
          error = new Error(ik[0].message);
        } else {
          error = new Error('form failed validation');
        }
        error.invalidKeys = ik;
      } else {
        error = new Error('form failed validation');
      }
      _.each(onError, function onErrorEach(hook) {
        hook.call(hookContext, 'pre-submit validation', error, template);
      });
      haltSubmission();
    }

    // Prep callback creator function
    function makeCallback(name) {
      var afterHooks = Hooks.getHooks(formId, 'after', name);
      return function autoFormActionCallback(error, result) {
        if (error) {
          if (onError && onError.length) {
            _.each(onError, function onErrorEach(hook) {
              hook.call(hookContext, name, error, template);
            });
          } else if ((!afterHooks || !afterHooks.length) && ss.namedContext(formId).isValid()) {
            // if there are no onError or "after" hooks or validation errors, log the error
            // because it must be some other error from the server
            console.log(error);
          }
        } else {
          // By default, we reset form after successful submit, but
          // you can opt out. We should never reset after submit
          // when autosaving.
          if (form.resetOnSuccess !== false && form.autosave !== true) {
            AutoForm.resetForm(formId, template);
          }
          // Set docId in the context for insert forms, too
          if (name === "insert") {
            hookContext.docId = result;
          }
          _.each(onSuccess, function onSuccessEach(hook) {
            hook.call(hookContext, name, result, template);
          });
        }
        _.each(afterHooks, function afterHooksEach(hook) {
          hook.call(hookContext, error, result, template);
        });
        // Run endSubmit hooks (re-enabled submit button or form, etc.)
        endSubmit(formId, template, hookContext);
      };
    }

    // Prep function that calls before hooks.
    // We pass the template instance in case the hook
    // needs the data context.
    function doBefore(docId, doc, hooks, name, next) {
      // We call the hooks recursively, in order added,
      // passing the result of the first hook to the
      // second hook, etc.
      function runHook(i, doc) {
        var hook = hooks[i];

        if (!hook) {
          // We've run all hooks; continue submission
          next(doc);
          return;
        }

        // Set up before hook context
        var cb = function (d) {
          // If the hook returns false, we cancel
          if (d === false) {
            // Run endSubmit hooks (re-enabled submit button or form, etc.)
            endSubmit(formId, template);
          } else {
            if (!_.isObject(d)) {
              throw new Error(name + " must return an object");
            }
            runHook(i+1, d);
          }
        };
        var ctx = _.extend({
          result: _.once(cb)
        }, hookContext);

        var result;
        if (docId) {
          result = hook.call(ctx, docId, doc, template);
        } else {
          result = hook.call(ctx, doc, template);
        }
        // If the hook returns undefined, we wait for it
        // to call this.result()
        if (result !== void 0) {
          ctx.result(result);
        }
      }

      runHook(0, doc);
    }

    // Prep function that calls onSubmit hooks.
    // We pass the template instance in case the hook
    // needs the data context, and event in case they
    // need to prevent default, etc.
    function doOnSubmit(hooks, insertDoc, updateDoc, currentDoc) {
      // These are called differently from the before hooks because
      // they run async, but they can run in parallel and we need the
      // result of all of them immediately because they can return
      // false to stop normal form submission.

      var hookCount = hooks.length, doneCount = 0, submitError, submitResult;

      if (hookCount === 0) {
        // Run endSubmit hooks (re-enabled submit button or form, etc.)
        endSubmit(formId, template);
        return;
      }

      // Set up onSubmit hook context
      var ctx = _.extend({
        done: function (error, result) {
          doneCount++;
          if (!submitError && error) {
            submitError = error;
          }
          if (!submitResult && result) {
            submitResult = result;
          }
          if (doneCount === hookCount) {
            var submitCallback = makeCallback('submit');
            // run onError, onSuccess, endSubmit
            submitCallback(submitError, submitResult);
          }
        }
      }, hookContext);

      // Call all hooks at once.
      // Pass both types of doc plus the doc attached to the form.
      // If any return false, we stop normal submission, but we don't
      // run onError, onSuccess, endSubmit hooks until they all call this.done().
      var shouldStop = false;
      _.each(hooks, function eachOnSubmit(hook) {
        var result = hook.call(ctx, insertDoc, updateDoc, currentDoc);
        if (shouldStop === false && result === false) {
          shouldStop = true;
        }
      });
      if (shouldStop) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    // Gather all form values
    var formDocs = getFormValues(template, formId, ss);
    var insertDoc = formDocs.insertDoc;
    var updateDoc = formDocs.updateDoc;

    // This validation pass happens before any "before" hooks run. It should happen
    // only when there is both a collection AND a schema specified, in which case we
    // validate first against the form schema. Then before hooks can add any missing
    // properties before we validate against the full collection schema.
    //
    // We also validate at this time if we're doing normal form submission, in which
    // case there are no "before" hooks, and this is the only validation pass we do
    // before running onSubmit hooks and potentially allowing the browser to submit.
    if (form.validation !== 'none' && (ssIsOverride || isNormalSubmit)) {
      // Catch exceptions in validation functions which will bubble up here, cause a form with
      // onSubmit() to submit prematurely and prevent the error from being reported
      // (due to a page refresh).
      try {
        isValid = _validateForm(formId, formDocs);
      } catch (e) {
        console.error('Validation error', e);
        isValid = false;
      }
      // If we failed pre-submit validation, we stop submission.
      if (isValid === false) {
        return failedValidation();
      }
    }

    // Run beginSubmit hooks (disable submit button or form, etc.)
    // NOTE: This needs to stay after getFormValues in case a
    // beginSubmit hook disables inputs. We don't get values for
    // disabled inputs, but if they are just disabling during submission,
    // then we actually do want the values.
    beginSubmit(formId, template, hookContext);

    // Now we will do the requested insert, update, method, or normal
    // browser form submission.
    var validationOptions = {
      validationContext: formId,
      filter: form.filter,
      autoConvert: form.autoConvert,
      removeEmptyStrings: form.removeEmptyStrings,
      trimStrings: form.trimStrings
    };

    // INSERT FORM SUBMIT
    if (isInsert) {
      // Get "before.insert" hooks
      var beforeInsertHooks = Hooks.getHooks(formId, 'before', 'insert');
      // Run "before.insert" hooks
      doBefore(null, insertDoc, beforeInsertHooks, 'before.insert hook', function (doc) {
        // Make callback for insert
        var insertCallback = makeCallback('insert');
        // Perform insert
        if (typeof collection.simpleSchema === "function" && collection.simpleSchema() != null) {
          // If the collection2 pkg is used and a schema is attached, we pass a validationContext
          collection.insert(doc, validationOptions, insertCallback);
        } else {
          // If the collection2 pkg is not used or no schema is attached, we don't pass options
          // because core Meteor's `insert` function does not accept
          // an options argument.
          collection.insert(doc, insertCallback);
        }
      });
    }

    // UPDATE FORM SUBMIT
    else if (isUpdate) {
      // Get "before.update" hooks
      var beforeUpdateHooks = Hooks.getHooks(formId, 'before', 'update');
      // Run "before.update" hooks
      doBefore(docId, updateDoc, beforeUpdateHooks, 'before.update hook', function (modifier) {
        // Make callback for update
        var updateCallback = makeCallback('update');
        if (_.isEmpty(modifier)) { // make sure this check stays after the before hooks
          // Nothing to update. Just treat it as a successful update.
          updateCallback(null, 0);
        } else {
          // Perform update
          collection.update(docId, modifier, validationOptions, updateCallback);
        }
      });
    }

    // METHOD FORM SUBMIT
    else if (isMethod) {
      // Get "before.methodName" hooks
      if (!method) {
        throw new Error('When form type is "method", you must also provide a "meteormethod" attribute');
      }
      var beforeMethodHooks = Hooks.getHooks(formId, 'before', method);
      // Run "before.methodName" hooks
      doBefore(null, insertDoc, beforeMethodHooks, 'before.method hook', function (doc) {
        // Validate. If both schema and collection were provided, then we validate
        // against the collection schema here. Otherwise we validate against whichever
        // one was passed.
        isValid = _validateForm(formId, formDocs, ssIsOverride);
        if (isValid === false) {
          return failedValidation();
        }
        // Make callback for Meteor.call
        var methodCallback = makeCallback(method);
        // Call the method
        Meteor.call(method, doc, updateDoc, docId, methodCallback);
      });
    }

    // NORMAL FORM SUBMIT
    else if (isNormalSubmit) {
      // Get onSubmit hooks
      var onSubmitHooks = Hooks.getHooks(formId, 'onSubmit');
      doOnSubmit(onSubmitHooks, insertDoc, updateDoc, currentDoc);
    }
  },
  'keyup [data-schema-key]': function autoFormKeyUpHandler(event, template) {
    var validationType = template.data.validation || 'submitThenKeyup';
    var onlyIfAlreadyInvalid = (validationType === 'submitThenKeyup');
    var skipEmpty = !(event.keyCode === 8 || event.keyCode === 46); //if deleting or backspacing, don't skip empty
    if ((validationType === 'keyup' || validationType === 'submitThenKeyup')) {
      validateField(event.currentTarget.getAttribute("data-schema-key"), template, skipEmpty, onlyIfAlreadyInvalid);
    }
  },
  'blur [data-schema-key]': function autoFormBlurHandler(event, template) {
    var validationType = template.data.validation || 'submitThenKeyup';
    var onlyIfAlreadyInvalid = (validationType === 'submitThenKeyup' ||
                                validationType === 'submitThenBlur');
    if (validationType === 'keyup' ||
        validationType === 'blur' ||
        validationType === 'submitThenKeyup' ||
        validationType === 'submitThenBlur') {
      validateField(event.currentTarget.getAttribute("data-schema-key"), template, false, onlyIfAlreadyInvalid);
    }
  },
  'change form': function autoFormChangeHandler(event, template) {
    var self = this;

    var key = event.target.getAttribute("data-schema-key");
    if (!key) {
      key = $(event.target).closest('[data-schema-key]').attr("data-schema-key");
      if (!key) return;
    }

    var formId = self.id;

    // Mark field value as changed for reactive updates
    updateTrackedFieldValue(formId, key);

    // Get current form data context
    var data = AutoForm.getCurrentDataForForm(formId);

    // If the form should be auto-saved whenever updated, we do that on field
    // changes instead of validating the field
    if (data.autosave === true) {
      lastAutoSaveElement = event.target;
      $(event.currentTarget).submit();
      return;
    }

    var validationType = data.validation || 'submitThenKeyup';
    var onlyIfAlreadyInvalid = (validationType === 'submitThenKeyup' ||
                                validationType === 'submitThenBlur');
    if (validationType === 'keyup' ||
        validationType === 'blur' ||
        validationType === 'submitThenKeyup' ||
        validationType === 'submitThenBlur') {
      validateField(key, template, false, onlyIfAlreadyInvalid);
    }
  },
  'reset form': function autoFormResetHandler(event, template) {
    var formId = this.id;

    AutoForm.formPreserve.clearDocument(formId);

    // Reset array counts
    arrayTracker.resetForm(formId);

    var vc = AutoForm.getValidationContext(formId);
    if (vc) {
      vc.resetValidation();
      // If simpleSchema is undefined, we haven't yet rendered the form, and therefore
      // there is no need to reset validation for it. No error need be thrown.
    }

    if (this.doc) {
      event.preventDefault();

      // Use destroy form hack since Meteor doesn't give us an easy way to
      // invalidate changed form attributes yet.
      afDestroyUpdateForm.set(true);
      Tracker.flush();
      afDestroyUpdateForm.set(false);
      Tracker.flush();

      // Focus the autofocus element
      if (template && template.view._domrange && !template.view.isDestroyed) {
        template.$("[autofocus]").focus();
      }
    } else {
      // This must be done after we allow this event handler to return
      // because we have to let the browser reset all fields before we
      // update their values for deps.
      setTimeout(function () {
        // Mark all fields as changed
        updateAllTrackedFieldValues(formId);

        // Focus the autofocus element
        if (template && template.view._domrange && !template.view.isDestroyed) {
          template.$("[autofocus]").focus();
        }
      }, 0);
    }

  },
  'keydown .autoform-array-item input': function (event, template) {
    // When enter is pressed in an array item field, default behavior
    // seems to be to "click" the remove item button. This doesn't make
    // sense so we stop it.
    if (event.keyCode === 13) {
      event.preventDefault();
    }
  },
  'click .autoform-remove-item': function autoFormClickRemoveItem(event, template) {
    var self = this; // This type of button must be used within an afEachArrayItem block, so we know the context

    event.preventDefault();

    var name = self.arrayFieldName;
    var minCount = self.minCount; // optional, overrides schema
    var maxCount = self.maxCount; // optional, overrides schema
    var index = self.index;
    var data = template.data;
    var formId = data && data.id;
    var ss = AutoForm.getFormSchema(formId);

    // remove the item we clicked
    arrayTracker.removeFromFieldAtIndex(formId, name, index, ss, minCount, maxCount);
  },
  'click .autoform-add-item': function autoFormClickAddItem(event, template) {
    event.preventDefault();

    // We pull from data attributes because the button could be manually
    // added anywhere, so we don't know the data context.
    var btn = $(event.currentTarget);
    var name = btn.attr("data-autoform-field");
    var minCount = btn.attr("data-autoform-minCount"); // optional, overrides schema
    var maxCount = btn.attr("data-autoform-maxCount"); // optional, overrides schema

    var data = template.data;
    var formId = data && data.id;
    var ss = AutoForm.getFormSchema(formId);

    arrayTracker.addOneToField(formId, name, ss, minCount, maxCount);
  }
});
