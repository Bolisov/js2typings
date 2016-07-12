/** @class */
function Data() {
    /**
     * @type {object}
     * @property {number} y This will show up as a property of `Data#point`,
     * but you cannot link to the property as {@link Data#point.y}.
     */
    this.point = {
        /**
         * The @alias and @memberof! tags force JSDoc to document the
         * property as `point.x` (rather than `x`) and to be a member of
         * `Data#`. You can link to the property as {@link Data#point.x}.
         * @alias point.x
         * @memberof! Data#
         */
        x: 0,
        y: 1
    };
}