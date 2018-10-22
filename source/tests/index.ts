// a test
import "reflect-metadata";
import { Inject, Container, AutoWire } from "../lib";

class B {
    test(): void {
        console.log("it works");
    }
}

@AutoWire
class A {
    @Inject
    private readonly b: B;

    test(): void {
        this.b.test();
    }
}

Container.bind(B).singleton(B);

const a = new A();
a.test();
