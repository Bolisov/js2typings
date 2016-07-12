/**
 * Options for ordering a delicious slice of pie.
 * @namespace
 */
var pieOptions = {
    /**
     * Plain.
     */
    plain: 'pie',
    /**
     * A la mode.
     * @readonly
     */
    get aLaMode() {
        return this.plain + ' with ice cream';
    }
};