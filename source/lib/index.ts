
interface InjectioGlobals {
    InitializationMap: Map<Function, string>;
    ConfigurationValues: Map<string, any>;
    BindingMap: Map<any, Binding<any>>;
    InjectionMap: Map<Function, Injections>;
    ConfigurationMap: Map<Function, Configurations>;
}

(global as any).injectioGlobals = (global as any).injectioGlobals || {
    InitializationMap: new Map<Function, string>(),
    ConfigurationValues: new Map<string, any>(),
    BindingMap: new Map<any, Binding<any>>(),
    InjectionMap: new Map<Function, Injections>(),
    ConfigurationMap: new Map<Function, Configurations>()
};

const Global = (global as any).injectioGlobals as InjectioGlobals;

export interface BindContext {
    name: string;
}

export type Constructable<T> = { new(...args: any[]): T; };
export type Inheritable<T> = Constructable<T> | { prototype: T };
export type ClassDecoratorFn<T> = (constructor: Constructable<T>) => void;
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
    static get(key: string, context: BindContext): any;
    static get<T>(key: Inheritable<T>, context: BindContext): T;
    static get<T>(key: BindingKey<T>, context: BindContext): any {
        const binding = Global.BindingMap.get(key);
        if (binding === undefined) {
            const keyName = (typeof key === "string") ? key : (key as any).name;
            throw new Error(`Cannot resolve binding ${keyName} in context of class ${context.name}`);
        }
        return binding.get(context);
    }

    static set(key: any, value: any): void {
        Global.BindingMap.set(key, value);
    }
}

type Injections = Map<string, BindingKey<any>>;
class InjectionMap {
    static get(key: Function): Injections {
        const injections = Global.InjectionMap.get(key) || new Map<string, Constructable<any>>();
        Global.InjectionMap.set(key, injections);
        return injections;
    }
}

type Configurations = Map<string, any>;
class ConfigurationMap {
    static get(key: Function): Configurations {
        const configurations = Global.ConfigurationMap.get(key) || new Map<string, string>();
        Global.ConfigurationMap.set(key, configurations);
        return configurations;
    }
}

class Container {
    static bind(key: string | symbol): UntypedBindingBuilder;
    static bind<T>(key: Inheritable<T>): TypedBindingBuilder<T>;
    static bind<T>(key: BindingKey<T> | symbol): TypedBindingBuilder<T> | UntypedBindingBuilder {
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
        if (target && instance) {
            const context = {
                name: instance.constructor.name
            };

            const injections = InjectionMap.get(target);
            for (const [key, value] of injections) {
                instance[key] = BindingMap.get(value as any, context);
            }

            const configurations = ConfigurationMap.get(target);
            for (const [instanceKey, configurationKey] of configurations) {
                const configurationValue = Global.ConfigurationValues.get(configurationKey);
                if (configurationValue === undefined) {
                    throw new Error(`Cannot resolve configuration key ${configurationKey} binded to attribute ${instanceKey} in context of class ${context.name}`);
                }

                instance[instanceKey] = configurationValue;
            }

            const newInstance = this.resolveInjections(instance, Object.getPrototypeOf(target));

            const initializator = Global.InitializationMap.get(target);
            if (initializator !== undefined) {
                const fn = newInstance[initializator] as Function;
                if (fn !== undefined) {
                    fn.call(newInstance);
                }
            }

            return newInstance;
        } else {
            return instance;
        }
    }

    static configure(key: string, value: any): void {
        Global.ConfigurationValues.set(key, value);
    }
}

function Initializator(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    Global.InitializationMap.set(target.constructor, propertyKey);
}

function Inject(name: string | symbol): FunctionDecoratorFn;
function Inject(target: any, propertyKey: string): void;
function Inject(target: any, propertyKey?: string): FunctionDecoratorFn | void {
    if (typeof target === "string" || typeof target === "symbol") {
        return (target2, propertyKey2) => {
            InjectionMap.get(target2.constructor).set(propertyKey2, target as any);
        };
    } else {
        InjectionMap.get(target.constructor).set(propertyKey as string, Reflect.getMetadata("design:type", target, propertyKey as string));
    }
}

function Configuration(name: string): FunctionDecoratorFn {
    return (target, propertyKey) => {
        ConfigurationMap.get(target.constructor).set(propertyKey, name);
    };
}

function Singleton<T>(constructor: Constructable<T>): void;
function Singleton<T>(param1: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): ClassDecoratorFn<T>;
function Singleton<T>(param1?: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): void | ClassDecoratorFn<T> {
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
function Instance<T>(param1: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): ClassDecoratorFn<T>;
function Instance<T>(param1?: any, param2?: any, param3?: any, param4?: any, param5?: any, param6?: any, param7?: any, param8?: any, param9?: any): void | ClassDecoratorFn<T> {
    if (param1 && typeof param1 === "function") {
        const constructor = param1 as Constructable<T>;
        Container.bind(constructor).instance(constructor);
    } else {
        return <T>(constructor: Constructable<T>) => {
            Container.bind(constructor).instance(constructor, param1, param2, param3, param4, param5, param6, param7, param8, param9);
        };
    }
}

function Factory<T>(fn: FactoryFn<T>): ClassDecoratorFn<T> {
    return <T>(constructor: Constructable<T>) => {
        Container.bind(constructor).factory(fn);
    };
}

function Bind<T, T2 extends T>(bindConstructor: Inheritable<T>): {
    Singleton: ClassDecoratorFn<T2>,
    Instance: ClassDecoratorFn<T2>,
    Factory: (fn: FactoryFn<T2>) => ClassDecoratorFn<T2>
} {
    return {
        Singleton: (constructor: Constructable<T2>) => {
            Container.bind(bindConstructor).singleton(constructor);
        },

        Instance: (constructor: Constructable<T2>) => {
            Container.bind(bindConstructor).instance(constructor);
        },

        Factory: (fn: FactoryFn<T2>) => {
            return (constructor: Constructable<T2>) => {
                Container.bind(bindConstructor).instance(constructor);
            };
        }
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

export { Container, Inject, Singleton, Instance, AutoWire, Factory, Bind, Initializator, Configuration };
