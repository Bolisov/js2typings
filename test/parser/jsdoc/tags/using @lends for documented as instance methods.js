/** @class */
var Person = makeClass(
    /** @lends Person.prototype */
    {
        initialize: function(name) {
            this.name = name;
        },
        say: function(message) {
            return this.name + " says: " + message;
        }
    }
);