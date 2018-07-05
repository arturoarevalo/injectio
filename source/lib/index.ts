export interface BindContext {
    name: string;
}

export type Constructable<T> = { new(...args: any[]): T; };
export type Inheritable<T> = Constructable<T> | { prototype: T };
export type ClassDecoratorFn = <T>(constructor: Constructable<T>) => void;
export type FunctionDecoratorFn = (target: any, propertyKey: string) => void;
export type FactoryFn<T> = (context?: BindContext) => T;

export type BindingKey<T> = Inheritable<T> | string;

export abstract class Binding<T> {
    protected readonly parameters: any[];

    constructor(key: any, ...parameters: any[]) {
        BindingMap.set(key, this);
        this.parameters = parameters;
    }

    abstract get(context?: BindContext): T;
}

export class ValueBinding<T> extends Binding<T> {
    constructor(key: any, private readonly value: T) {
        super(key);
    }

    get(): T {
        return this.value;
    }
}

export class FactoryBinding<T> extends Binding<T> {
    constructor(key: any, private readonly fn: FactoryFn<T>) {
        super(key);
    }

    get(context: BindContext): T {
        return this.fn(context);
    }
}

export class SingletonBinding<T> extends Binding<T> {
    private singletonInstance: T;

    constructor(key: any, private readonly type: Constructable<T>, ...params: any[]) {
        super(key, ...params);
    }

    get(): T {
        if (this.singletonInstance === undefined) {
            this.singletonInstance = Container.createInstance(this.type, ...this.parameters);
        }
        return this.singletonInstance;
    }
}

export class InstanceBinding<T> extends Binding<T> {
    constructor(key: any, private readonly type: Constructable<T>, ...params: any[]) {
        super(key, ...params);
    }

    get(): T {
        return Container.createInstance(this.type, ...this.parameters);
    }
}

export class TypedBindingBuilder<T> {

    constructor(private readonly key: any) { }

    value(value: T): Binding<T> {
        return new ValueBinding<T>(this.key, value);
    }

    singleton(type: Constructable<T>, ...parameters: any[]): Binding<T> {
        return new SingletonBinding<T>(this.key, type, ...parameters);
    }

    instance(type: Constructable<T>, ...parameters: any[]): Binding<T> {
        return new InstanceBinding<T>(this.key, type, ...parameters);
    }

    factory(fn: FactoryFn<T>): Binding<T> {
        return new FactoryBinding<T>(this.key, fn);
    }
}

export class UntypedBindingBuilder {
    constructor(private readonly key: any) { }

    value<T>(value: T): Binding<T> {
        return new ValueBinding<T>(this.key, value);
    }

    singleton<T>(type: Constructable<T>, ...parameters: any[]): Binding<T> {
        return new SingletonBinding<T>(this.key, type, ...parameters);
    }

    instance<T>(type: Constructable<T>, ...parameters: any[]): Binding<T> {
        return new InstanceBinding<T>(this.key, type, ...parameters);
    }

    factory<T>(fn: FactoryFn<T>): Binding<T> {
        return new FactoryBinding<T>(this.key, fn);
    }
}

class BindingMap {
    private static map = new Map<any, Binding<any>>();

    static get(key: string, context: BindContext): any;
    static get<T>(key: Inheritable<T>, context: BindContext): T;
    static get<T>(key: BindingKey<T>, context: BindContext): any {
        const binding = this.map.get(key);
        if (binding === undefined) {
            const keyName = (typeof key === "string") ? key : (key as any).name;
            throw new Error(`cannot resolve binding ${keyName} in context of class ${context.name}`);
        }
        return binding.get(context);
    }

    static set(key: any, value: any): void {
        this.map.set(key, value);
    }
}

type Injections = Map<string, BindingKey<any>>;
class InjectionMap {
    private static map = new Map<Function, Injections>();

    static get(key: Function): Injections {
        const injections = this.map.get(key) || new Map<string, Constructable<any>>();
        this.map.set(key, injections);
        return injections;
    }
}

class Container {

    static bind(key: string): UntypedBindingBuilder;
    static bind<T>(key: Inheritable<T>): TypedBindingBuilder<T>;
    static bind<T>(key: BindingKey<T>): TypedBindingBuilder<T> | UntypedBindingBuilder {
        if (typeof key === "string") {
            return new UntypedBindingBuilder(key);
        } else {
            return new TypedBindingBuilder<T>(key);
        }
    }

    static get(key: string): any;
    static get<T>(key: Inheritable<T>): T;
    static get<T>(key: BindingKey<T>): any {
        return BindingMap.get<any>(key as any, { name: "global" });
    }

    static createInstance<T>(constructor: Constructable<T>, ...parameters: any[]): T {
        const realConstructor = (constructor as any).__autowired || constructor;
        const instance = new realConstructor(...parameters);
        return this.resolveInjections(instance, constructor);
    }

    static resolveInjections(instance: any, target: Function): any {
        if (target) {
            const injections = InjectionMap.get(target);
            for (const [key, value] of injections) {
                const context = {
                    name: instance.constructor.name
                };
                instance[key] = BindingMap.get(value as any, context);
            }
            return this.resolveInjections(instance, Object.getPrototypeOf(target));
        } else {
            return instance;
        }
    }
}

function Inject(name: string): FunctionDecoratorFn;
function Inject(target: any, propertyKey: string): void;
function Inject(target: any, propertyKey?: string): FunctionDecoratorFn | void {
    if (typeof target === "string") {
        return (target2, propertyKey2) => InjectionMap.get(target2.constructor).set(propertyKey2, target);
    } else {
        InjectionMap.get(target.constructor).set(propertyKey as string, Reflect.getMetadata("design:type", target, propertyKey as string));
    }
}

function Singleton<T>(constructor: Constructable<T>): void;
function Singleton<T>(param1: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): ClassDecoratorFn;
function Singleton<T>(param1?: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): void | ClassDecoratorFn {
    if (param1 && typeof param1 === "function") {
        const constructor = param1 as Constructable<T>;
        Container.bind(constructor).singleton(constructor);
    } else {
        return <T>(constructor: Constructable<T>) => {
            Container.bind(constructor).singleton(constructor, param1, param2, param3, param4, param5, param6, param7, param8, param9);
        };
    }
}

function Instance<T>(constructor: Constructable<T>): void;
function Instance<T>(param1: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): ClassDecoratorFn;
function Instance<T>(param1?: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): void | ClassDecoratorFn {
    if (param1 && typeof param1 === "function") {
        const constructor = param1 as Constructable<T>;
        Container.bind(constructor).instance(constructor);
    } else {
        return <T>(constructor: Constructable<T>) => {
            Container.bind(constructor).instance(constructor, param1, param2, param3, param4, param5, param6, param7, param8, param9);
        };
    }
}

function Factory<T>(fn: FactoryFn<T>): ClassDecoratorFn {
    return <T>(constructor: Constructable<T>) => {
        Container.bind(constructor).factory(fn);

    };
}

function AutoWire<T>(constructor: any): any {
    const newClass = class extends constructor {
        constructor() {
            super();
            Container.resolveInjections(this, constructor);
        }
    };

    newClass.__autowired = constructor;
    return newClass;

}

export { Container, Inject, Singleton, Instance, AutoWire, Factory };
