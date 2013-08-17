//define AutoForm object; used for forms that are not related to collections

//exported
AutoForm = function(schema) {
    var self = this;
    self._simpleSchema = new SimpleSchema(schema);
};

AutoForm.prototype.validate = function(doc) {
    var self = this, schema = self._simpleSchema;

    //clean doc
    doc = schema.filter(doc);
    doc = schema.autoTypeConvert(doc);
    //validate doc
    schema.validate(doc);

    return schema.valid();
};

AutoForm.prototype.simpleSchema = function() {
    return this._simpleSchema;
};

AutoForm.prototype.callbacks = function(cb) {
    this._callbacks = cb;
};

//add callbacks() method to Meteor.Collection2
if (typeof Meteor.Collection2 !== 'undefined') {
    Meteor.Collection2.prototype.callbacks = function(cb) {
        this._callbacks = cb;
    };
}