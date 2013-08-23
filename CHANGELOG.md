AutoForm
=========================

AutoForm is a smart package for Meteor that adds handlebars helpers to easily create basic
forms with automatic insert and update events, and automatic reactive validation. 

## Change Log

### 0.2.1

Fix input helper to use value passed in `value` attribute if no doc is attached to the autoform.

### 0.2.0

* For autoforms that call a server method, server-side validation is no longer performed automatically. This had to be removed to fix a security issue. After updating to 0.2.0, you must call `check()` in the Meteor method.
* Add `formToDoc` and `docToForm` functions. See the readme.
* Improve keyup validation
* Allow direct binding of Collection2 or AutoForm object to autoForm helper through the schema attribute. Passing in the string name of a global object is still supported, but binding is the preferred method now.