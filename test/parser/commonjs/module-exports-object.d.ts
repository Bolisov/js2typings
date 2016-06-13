declare module "module-exports-object" {
    class __module__ {
        public sayHelloInEnglish(): any;
        public sayHelloInSpanish(): any;
    }

    export = new __module__;
}