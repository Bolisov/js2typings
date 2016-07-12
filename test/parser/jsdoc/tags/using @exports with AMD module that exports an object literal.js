define(function() {

    /**
     * A module that whispers hello!
     * @module hello/world
     */
    var exports = {};

    /** say hello. */
    exports.sayHello = function() {
        return 'hello world';
    };

    return exports;
});