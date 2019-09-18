/* eslint-disable no-console */
import { invariant, isPrimitive } from "../utils/utils"
import createModelSchema from "../api/createModelSchema"
import getDefaultModelSchema from "../api/getDefaultModelSchema"
import setDefaultModelSchema from "../api/setDefaultModelSchema"
import { SKIP, _defaultPrimitiveProp } from "../constants"

/**
 * Serializes an object (graph) into json using the provided model schema.
 * The model schema can be omitted if the object type has a default model schema associated with it.
 * If a list of objects is provided, they should have an uniform type.
 *
 * @param arg1 class or modelschema to use. Optional
 * @param arg2 object(s) to serialize
 * @returns {object} serialized representation of the object
 */
export default function serialize(arg1, arg2) {
    invariant(arguments.length === 1 || arguments.length === 2, "serialize expects one or 2 arguments")
    var thing = arguments.length === 1 ? arg1 : arg2
    var schema = arguments.length === 1 ? null : arg1
    if (Array.isArray(thing)) {
        if (thing.length === 0)
            return [] // don't bother finding a schema
        else if (!schema)
            schema = getDefaultModelSchema(thing[0])
        else if (typeof schema !== "object")
            schema = getDefaultModelSchema(schema)
    } else if (!schema) {
        schema = getDefaultModelSchema(thing)
    } else if (typeof schema !== "object") {
        schema = getDefaultModelSchema(schema)
    }
    invariant(!!schema, "Failed to find default schema for " + arg1)
    if (Array.isArray(thing))
        return thing.map(function (item) {
            return serializeWithSchema(schema, item)
        })
    return serializeWithSchema(schema, thing)
}

export function checkStarSchemaInvariant(propDef) {
    invariant(propDef === true || propDef.pattern, "prop schema '*' can only be used with 'true'")
}

export function serializeWithSchema(schema, obj) {
    invariant(schema && typeof schema === "object", "Expected schema")
    invariant(obj && typeof obj === "object", "Expected object")
    var res
    if (schema.extends)
        res = serializeWithSchema(schema.extends, obj)
    else {
        // TODO: make invariant?:  invariant(!obj.constructor.prototype.constructor.serializeInfo, "object has a serializable supertype, but modelschema did not provide extends clause")
        res = {}
    }
    Object.keys(schema.props).forEach(function (key) {
        var propDef = schema.props[key]
        if (key === "*") {
            serializeStarProps(schema, propDef, obj, res)
            return
        }
        if (propDef === true)
            propDef = _defaultPrimitiveProp
        if (propDef === false)
            return
        var jsonValue = propDef.serializer(obj[key], key, obj)
        if (jsonValue === SKIP){
            return
        }
        res[propDef.jsonname || key] = jsonValue
    })
    return res
}

export function serializeStarProps(schema, propDef, obj, target) {
    checkStarSchemaInvariant(propDef)
    for (var key in obj) {
        let hasOwnProp = obj.hasOwnProperty(key)
        //console.log({obj, key, hasOwnProp})
        if (hasOwnProp) {
            if (!(key in schema.props)) {
                let onlyPrimitives = propDef === true
                let pattern = !onlyPrimitives && propDef.pattern
                let matchesPattern = pattern && pattern.test(key)
                //console.log({propDef, obj, key, pattern, onlyPrimitives, matchesPattern})
                if (onlyPrimitives || matchesPattern) {
                    var value = obj[key]
                    //console.log({propDef, obj, key, value});
                    if (onlyPrimitives) {
                        // when serializing only serialize primitive props. Assumes other props (without schema) are local state that doesn't need serialization
                        if (isPrimitive(value)) {
                            target[key] = value
                        }
                    } else {
                        var jsonValue = serializeWithSchema(propDef, value)
                        if (jsonValue === SKIP) {
                            return
                        }
                        target[/*propDef.jsonname ||*/ key] = jsonValue
                    }
                }
            }
        }
    }
}

/**
 * The `serializeAll` decorator can be used on a class to signal that all primitive properties should be serialized automatically.
 *
 * @example
 * @serializeAll class Store {
 *     a = 3;
 *     b;
 * }
 *
 * const store = new Store();
 * store.c = 5;
 * store.d = {};
 * t.deepEqual(serialize(store), { a: 3, b: undefined, c: 5 });
 */
export function serializeAll(target) {
    invariant(arguments.length === 1 && typeof target === "function", "@serializeAll can only be used as class decorator")

    var info = getDefaultModelSchema(target)
    if (!info || !target.hasOwnProperty("serializeInfo")) {
        info = createModelSchema(target, {})
        setDefaultModelSchema(target, info)
    }

    getDefaultModelSchema(target).props["*"] = true
    return target
}
