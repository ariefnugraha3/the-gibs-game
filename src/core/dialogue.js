// Pembaca naskah terpusat. Teks dialog tinggal di config/gameplay.json;
// proxy menjaga API lama (map[index], .length, JSON.stringify) tanpa membaca
// CFG saat module dievaluasi sebelum loadConfig().
import { CFG } from './config.js';

function readPath(path) {
    let value = CFG.dialogue;
    for (const key of String(path).split('.')) value = value?.[key];
    return value;
}

function dynamic(path, list) {
    const target = list ? [] : {};
    return new Proxy(target, {
        get(target, key, receiver) {
            const data = readPath(path) || (list ? [] : {});
            if (key === 'toJSON') return () => data;
            if (key === Symbol.iterator && list) return data[Symbol.iterator].bind(data);
            if (key === 'length' && list) return data.length;
            if (typeof key === 'string' && key in data) return data[key];
            const value = Reflect.get(target, key, receiver);
            return typeof value === 'function' ? value.bind(receiver) : value;
        },
        has(_target, key) {
            const data = readPath(path) || (list ? [] : {});
            return key in data;
        },
        ownKeys() {
            const data = readPath(path) || (list ? [] : {});
            return Reflect.ownKeys(data);
        },
        getOwnPropertyDescriptor(_target, key) {
            const data = readPath(path) || (list ? [] : {});
            if (!(key in data)) return undefined;
            return { enumerable: true, configurable: true, value: data[key], writable: false };
        },
    });
}

export const dialogueMap = path => dynamic(path, false);
export const dialogueList = path => dynamic(path, true);
export const dialogueText = path => String(readPath(path) ?? '');
