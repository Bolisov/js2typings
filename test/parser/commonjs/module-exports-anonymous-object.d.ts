declare module "module-exports-anonymous-object" {
    class Buz {
        public log: () => void
    }

    var static: Buz;

    export = static;
}