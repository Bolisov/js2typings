declare module "using @variation tag" {
    /**
     * The Widget class. Defaults to the properties in {@link Widget.properties}.     
     */
    class Widget {
        /**
         * @param props - Name-value pairs to add to the widget.
         */
        constructor(props: any);

        properties: {
            /**
             * Indicates whether the widget is shiny.
             */
            shiny: boolean,
            /**
             * Indicates whether the widget is metallic.
             */
            metallic: boolean
        }
    }
}