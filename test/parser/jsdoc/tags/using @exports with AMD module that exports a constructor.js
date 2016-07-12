define(function() {
    /**
     * A module that creates greeters.
     * @module greeter
     */

    /**
     * @constructor
     * @param {string} subject - The subject to greet.
     */
    var exports = function(subject) {
        this.subject = subject || 'world';
    };

    /** Say hello to the subject. */
    exports.prototype.sayHello = function() {
        return 'Hello ' + this.subject;
    };

    return exports;
});