Utility = {
  /**
   * @method Utility.cleanNulls
   * @param {Object} doc - Source object
   * @returns {Object}
   * 
   * Returns an object in which all properties with null, undefined, or empty
   * string values have been removed, recursively.
   */
  cleanNulls: function cleanNulls(doc) {
    var newDoc = {};
    _.each(doc, function(val, key) {
      if (!_.isArray(val) && !(val instanceof Date) && _.isObject(val)) {
        val = cleanNulls(val); //recurse into objects
        if (!_.isEmpty(val)) {
          newDoc[key] = val;
        }
      } else if (val !== void 0 && val !== null && !(typeof val === "string" && val.length === 0)) {
        newDoc[key] = val;
      }
    });
    return newDoc;
  },
  /**
   * @method Utility.reportNulls
   * @param {Object} flatDoc - An object with no properties that are also objects.
   * @returns {Object} An object in which the keys represent the keys in the
   * original object that were null, undefined, or empty strings, and the value
   * of each key is "".
   */
  reportNulls: function reportNulls(flatDoc) {
    var nulls = {};
    _.each(flatDoc, function(val, key) {
      if (val === void 0 || val === null || (typeof val === "string" && val.length === 0)) {
        nulls[key] = "";
      }
    });
    return nulls;
  },
  /**
   * @method Utility.docToModifier
   * @param {Object} doc - An object to be converted into a MongoDB modifier
   * @returns {Object} A MongoDB modifier.
   * 
   * Converts an object into a modifier by flattening it, putting keys with
   * null, undefined, and empty string values into `modifier.$unset`, and
   * putting the rest of the keys into `modifier.$set`.
   */
  docToModifier: function docToModifier(doc) {
    var modifier = {};

    // Flatten doc
    var mDoc = new MongoObject(doc);
    var flatDoc = mDoc.getFlatObject();
    mDoc = null;
    // Get a list of null, undefined, and empty string values so we can unset them instead
    var nulls = Utility.reportNulls(flatDoc);
    flatDoc = Utility.cleanNulls(flatDoc);
    
    // For arrays, we need the $set value as an array
    // rather than as separate array values, so we'll do
    // that adjustment here.
    // 
    // For example, if we have "numbers.0" = 1 and "numbers.1" = 2,
    // we will create "numbers" = [1,2]
    // 
    // This means that we cannot have a field
    // that updates just one item in an array without overwriting
    // the whole array, but there is no good way around that for
    // now because we can't ensure that there is an existing array
    // and therefore MongoDB might end up creating an object ({"0": value})
    // instead of an array. If we could use non-id selectors on the
    // client, then we could set the array to [] if it is null, ensuring
    // that MongoDB would know it's supposed to be an array.
    _.each(flatDoc, function(flatVal, flatKey) {
      var lastDot = flatKey.lastIndexOf(".");
      var beginning = flatKey.slice(0, lastDot);
      var end = flatKey.slice(lastDot + 1);
      var intEnd = parseInt(end, 10);
      if (!isNaN(intEnd)) {
        flatDoc[beginning] = flatDoc[beginning] || [];
        flatDoc[beginning][intEnd] = flatVal;
        delete flatDoc[flatKey];
      }
    });

    if (!_.isEmpty(flatDoc)) {
      modifier.$set = flatDoc;
    }
    if (!_.isEmpty(nulls)) {
      modifier.$unset = nulls;
    }
    return modifier;
  },
  /**
   * @method Utility.getSelectValues
   * @param {Element} select - DOM Element from which to get current values
   * @returns {string[]}
   * 
   * Gets a string array of all the selected values in a given `select` DOM element.
   */
  getSelectValues: function getSelectValues(select) {
    var result = [];
    var options = select && select.options;
    var opt;

    for (var i = 0, ln = options.length; i < ln; i++) {
      opt = options[i];

      if (opt.selected) {
        result.push(opt.value || opt.text);
      }
    }
    return result;
  },
  /**
   * @method Utility.maybeNum
   * @param {string} val
   * @returns {String|Number}
   * 
   * If the given string can be converted to a number, returns the number.
   * Otherwise returns the string.
   */
  maybeNum: function maybeNum(val) {
    // Convert val to a number if possible; otherwise, just use the value
    var floatVal = parseFloat(val);
    if (!isNaN(floatVal)) {
      return floatVal;
    } else {
      return val;
    }
  }
};