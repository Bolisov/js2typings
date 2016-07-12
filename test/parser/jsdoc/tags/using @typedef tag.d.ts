declare module "using @typedef tag" {
    /**
     * A number, or a string containing a number.
     */
    type NumberLike = number | string;

    /**
     * Set the magic number.
     * 
     * @param x The magic number.
     */
    function setMagicNumber(x: NumberLike): void;
}