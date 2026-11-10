export const Language = {
    zh_cn: 'zh-CN-XiaoxiaoNeural',
    zh_tw: 'zh-TW-HsiaoChenNeural',
    en: 'en-US-AriaNeural',
    ja: 'ja-JP-NanamiNeural',
    ko: 'ko-KR-SunHiNeural',
    fr: 'fr-FR-DeniseNeural',
    es: 'es-ES-ElviraNeural',
    ru: 'ru-RU-SvetlanaNeural',
    de: 'de-DE-KatjaNeural',
    it: 'it-IT-ElsaNeural',
    tr: 'tr-TR-EmelNeural',
    pt_pt: 'pt-PT-RaquelNeural',
    pt_br: 'pt-BR-FranciscaNeural',
    vi: 'vi-VN-HoaiMyNeural',
    id: 'id-ID-GadisNeural',
    th: 'th-TH-PremwadeeNeural',
    ms: 'ms-MY-YasminNeural',
    ar: 'ar-SA-ZariyahNeural',
    hi: 'hi-IN-SwaraNeural',
    mn_cy: 'mn-MN-YesuiNeural',
    km: 'km-KH-SreymomNeural',
    nb_no: 'nb-NO-PernilleNeural',
    nn_no: 'nb-NO-PernilleNeural',
    fa: 'fa-IR-DilaraNeural',
    sv: 'sv-SE-SofieNeural',
    pl: 'pl-PL-ZofiaNeural',
    nl: 'nl-NL-ColetteNeural',
    uk: 'uk-UA-PolinaNeural',
    he: 'he-IL-HilaNeural',
};

export function createEdgeTts(invoke) {
    return async function tts(text, languageVoice, { config = {} } = {}) {
        const voice = config.voice?.trim() || languageVoice;
        if (!voice) throw new Error('Language not supported');
        return invoke('edge_tts', { text, voice });
    };
}
