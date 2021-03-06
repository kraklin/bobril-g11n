/// <reference path="../typings/moment/moment-node.d.ts" />
import * as msgFormatParser from './msgFormatParser';
import * as msgFormatter from './msgFormatter';
import { jsonp } from './jsonp';
import * as localeDataStorage from './localeDataStorage';
import * as numberFormatter from './numberFormatter';

declare var b: {
    setBeforeInit(callback: (cb: () => void) => void): void;
    ignoreShouldChange(): void;
};

export interface IG11NConfig {
    defaultLocale?: string;
    pathToTranslation?: (locale: string) => string | undefined;
}

let spyTranslationFunc: ((text: string) => string) | undefined;

interface IMessageFormat {
    (params?: Object): string;
}

function newMap(): any {
    return Object.create(null);
}

let cfg: IG11NConfig = {
    defaultLocale: "en-US",
    pathToTranslation: () => undefined
};

let loadedLocales: { [name: string]: boolean } = newMap();
let registeredTranslations: { [name: string]: string[] } = newMap();
let initWasStarted = false;
let currentLocale = '';
let currentRules: localeDataStorage.ILocaleRules = localeDataStorage.getRules("en");
let currentUnformatter: ((val: string) => number) | undefined;
let currentTranslations: string[] = [];
let currentCachedFormat: IMessageFormat[] = [];
let stringCachedFormats: { [input: string]: IMessageFormat } = newMap();
let momentInstance: moment.Moment;

if ((<any>window).g11nPath) {
    cfg.pathToTranslation = (<any>window).g11nPath;
}

if ((<any>window).g11nLoc) {
    cfg.defaultLocale = (<any>window).g11nLoc;
}

function currentTranslationMessage(message: number): string {
    let text = currentTranslations[message];
    if (text === undefined) {
        throw new Error('message ' + message + ' is not defined');
    }
    return text;
}

function spyTranslatedString(translated: string) {
    if (spyTranslationFunc === undefined)
        return translated;

    return spyTranslationFunc(translated);
}

export function t(message: string | number, params?: Object, _translationHelp?: string): string {
    if (currentLocale.length === 0) {
        throw new Error('before using t you need to wait for initialization of g11n');
    }
    let format: IMessageFormat;
    if (typeof message === 'number') {
        if (params == null) {
            return spyTranslatedString(currentTranslationMessage(message));
        }
        format = currentCachedFormat[message];
        if (format === undefined) {
            let ast = msgFormatParser.parse(currentTranslationMessage(message));
            if (ast.type === 'error') {
                throw new Error('message ' + message + ' in ' + currentLocale + ' has error: ' + ast.msg);
            }
            format = msgFormatter.compile(currentLocale, ast);
            currentCachedFormat[message] = format;
        }
    } else {
        if (params == null) return spyTranslatedString(message);
        format = stringCachedFormats[message];
        if (format === undefined) {
            let ast = msgFormatParser.parse(message);
            if (ast.type === 'error') {
                throw new Error('message "' + message + '" has error: ' + ast.msg + ' on position: ' + ast.pos);
            }
            format = msgFormatter.compile(currentLocale, ast);
            stringCachedFormats[message] = format;
        }
    }
    return spyTranslatedString(format(params));
}

export function f(message: string, params: Object): string {
    return t(message, params);
}

let initPromise = Promise.resolve<any>(null);
initPromise = initPromise.then(() => setLocale(cfg.defaultLocale!));
b.setBeforeInit((cb: (_: any) => void) => {
    initPromise.then(cb, cb);
});

export function initGlobalization(config?: IG11NConfig): Promise<void> {
    if (initWasStarted) {
        throw new Error('initLocalization must be called only once');
    }
    Object.assign(cfg, config);
    initWasStarted = true;
    if (currentLocale.length !== 0) {
        if (!loadedLocales[currentLocale]) {
            currentLocale = "";
        }
        return setLocale(cfg.defaultLocale!);
    }
    return initPromise;
}

export function setLocale(locale: string): Promise<void> {
    let prom = Promise.resolve();
    if (currentLocale === locale)
        return prom;
    if (!loadedLocales[locale]) {
        let pathToTranslation = cfg.pathToTranslation;
        if (pathToTranslation) {
            let p = pathToTranslation(locale);
            if (p) {
                prom = prom.then(() => jsonp(p!)).catch((e) => {
                    console.warn(e);
                    if (locale != cfg.defaultLocale)
                        return setLocale(cfg.defaultLocale!).then(() => Promise.reject(e));
                    return undefined;
                });
            }
        }
    }
    prom = prom.then(() => {
        currentLocale = locale;
        currentRules = localeDataStorage.getRules(locale);
        currentTranslations = registeredTranslations[locale] || [];
        currentUnformatter = undefined;
        currentCachedFormat = [];
        currentCachedFormat.length = currentTranslations.length;
        stringCachedFormats = newMap();
        momentInstance = (<any>window).moment().locale(currentLocale);
        b.ignoreShouldChange();
    });
    return prom;
}

export function getLocale(): string {
    return currentLocale;
}

export function getMoment(init?: any, init2?: any, init3?: any): moment.Moment {
    if (init !== undefined) {
        return (<any>window).moment(init, init2, init3).locale(currentLocale);
    }
    return momentInstance.clone();
}

export function unformatNumber(str: string): number {
    if (currentUnformatter === undefined) {
        currentUnformatter = numberFormatter.buildUnformat(currentRules);
    }
    return currentUnformatter(str);
}

export function registerTranslations(locale: string, localeDefs: any[], msgs: string[]): void {
    if (Array.isArray(localeDefs)) {
        localeDataStorage.setRules(locale, localeDefs);
    }
    if (Array.isArray(msgs))
        registeredTranslations[locale] = msgs;
    loadedLocales[locale] = true;
}

export function spyTranslation(spyFn?: ((text: string) => string) | null): ((text: string) => string) | undefined {
    if (spyFn === undefined)
        return spyTranslationFunc;
    if (spyFn === null) {
        spyTranslationFunc = undefined;
    }
    else {
        spyTranslationFunc = spyFn;
    }
    return spyTranslationFunc;
}

if (window) {
    (<any>window)['bobrilRegisterTranslations'] = registerTranslations;
    (<any>window)['b'].spyTr = spyTranslation;
}
