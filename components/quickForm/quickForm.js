/* global AutoForm */
import {
  getSortedFieldGroupNames,
  getFieldsForGroup,
  getFieldsWithNoGroup
} from './quickFormUtils';

Template.quickForm.helpers({
  getTemplateName: function () {
    return AutoForm.getTemplateName('quickForm', this.template);
  },
  innerContext: function quickFormContext() {

    var atts = this;
    var adjustedData = AutoForm.parseData({ ...this });
    var simpleSchema = adjustedData._resolvedSchema;
    var sortedSchema = {};
    var fieldGroups = [];
    var grouplessFieldContext;

    // --------------- A. Schema --------------- //

    var fieldList = atts.fields;
    if (fieldList) {
      fieldList = AutoForm.Utility.stringToArray(fieldList, 'AutoForm: fields attribute must be an array or a string containing a comma-delimited list of fields');
    } else {
      const fullSchema = simpleSchema.mergedSchema();
      fieldList = Object.keys(fullSchema);
    }

    // get the schema object, but sorted into the same order as the field list
    fieldList.forEach(fieldName => {
      sortedSchema[fieldName] = AutoForm.Utility.getFieldDefinition(simpleSchema, fieldName);
    });

    // --------------- B. Field With No Groups --------------- //

    var grouplessFields = getFieldsWithNoGroup(sortedSchema);
    if (grouplessFields.length > 0) {
      grouplessFieldContext = {
        atts: { ...atts, fields: grouplessFields },
        fields: grouplessFields
      };
    }

    // --------------- C. Field With Groups --------------- //

    // get sorted list of field groups
    var fieldGroupNames = getSortedFieldGroupNames(sortedSchema);

    // Loop through the list and make a field group context for each
    fieldGroupNames.forEach(function (fieldGroupName) {
      var fieldsForGroup = getFieldsForGroup(fieldGroupName, sortedSchema);

      if (fieldsForGroup.length > 0) {
        fieldGroups.push({
          name: fieldGroupName,
          atts: { ...atts, fields: fieldsForGroup },
          fields: fieldsForGroup
        });
      }
    });

    // --------------- D. Context --------------- //

    // Pass along quickForm context to autoForm context, minus a few
    // properties that are specific to quickForms.
    const { buttonContent, buttonClasses, fields, omitFields, 'id-prefix': idPrefix, ...qfAutoFormContext } = atts

    // Determine whether we want to render a submit button
    var qfShouldRenderButton = (atts.buttonContent !== false && atts.type !== 'readonly' && atts.type !== 'disabled');

    var context = {
      qfAutoFormContext: qfAutoFormContext,
      atts: atts,
      qfShouldRenderButton: qfShouldRenderButton,
      fieldGroups: fieldGroups,
      grouplessFields: grouplessFieldContext
    };

    return context;
  }
});
