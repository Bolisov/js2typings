declare module "export-from-named-as-specifiers" {
    export { foo as default } from "foo";
    export { bar } from "foo";
}