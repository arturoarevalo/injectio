# injectio
> from Latin *injectio(n-)*, an instance of injecting or being injected

An opinionated, minimalist, dependency-free but functional dependency injection (DI) and inversion of control (IoC) for TypeScript.

## Installation
```npm install --save injectio```

## Basic usage
```typescript
import { Container, Inject, Singleton } from "injectio";

abstract class Logger { ... }

class ElasticSearchLogger implements Logger { ... }

class InterestingClass {
    @Inject
    private readonly logger: Logger;
}

// tell the IoC container that we want the same (singleton) ElasticSearchLogger instance when we request an instance of a Logger
Container.bind(Logger).singleton(ElasticSearchLogger);

const instance = Container.createInstance(InterestingClass)
// instance.logger === ElasticSearchLogger

const logger = Container.get(Logger);
// logger === instance.logger === ElasticSearchLogger
```

## Declarative binding
```typescript
// same as Container.bind(A).singleton(B)
@Bind(A).Singleton
class B implements A { ... }

// same as Container.bind(A).instance(B)
@Bind(A).Instance
class B implements A { ... }

// same as Container.bind(A).factory((context) => new B())
@Bind(A).Factory((context) => return new B())
class B implements A { ... }
```

## Configuration values
```typescript
@Singleton
class A {
    @Configuration("mongo-connection-string")
    readonly connectionString: string;
}

Container.configure("mongo-connection-string", process.env.MONGO_CONNECTION_STRING));
```

## Auto wiring
Automatic wiring allows classes to be directly instantiated without using the Container methods while resolving their injected dependencies.
```typescript
@Singleton
class A { ... }

@AutoWire
class B {
    @Inject
    a: A;
}

const b = new B();
// b.a is a valid reference
```

## Initializators
Initializators allow to execute arbitrary code after a instance of a binded class has been constructed and its dependencies injected.
```typescript
@Singleton
class A {
    multiply(v1: number, v2: number): number { return v1 * v2; }
}

@Instance
class B {
    @Inject
    a: A;

    squared: number;

    @Initializator
    init(): void {
        this.squared = this.a.multiply(10, 10);
    }
}

const b = Container.get(B);
// b.squared === 100
```
