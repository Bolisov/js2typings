var Person = makeClass(
    /** @lends Person.prototype */
    {
        /** @constructs */
        initialize: function(name) {
            this.name = name;
        },
        say: function(message) {
            return this.name + " says: " + message;
        }
    }
);