declare module "module-exports-anonymous-object" {
    class Buz {
        public log(): void;
    }
    
    export = new Buz();
}