import { Button, Input } from '@nextui-org/react';
import React, { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useConfig, useToastStyle } from '../../../hooks';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import { translate, Language } from './index';

export function Config({ instanceKey, updateServiceList, onClose }) {
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [isLoading, setIsLoading] = useState(false);
    const [config, setConfig] = useConfig(
        instanceKey,
        {
            [INSTANCE_NAME_CONFIG_KEY]: 'DeepSeek',
            apiKey: '',
            model: 'deepseek-flash',
            requestPath: 'https://api.deepseek.com/chat/completions',
        },
        { sync: false }
    );

    return (
        config !== null && (
            <form
                onSubmit={async (event) => {
                    event.preventDefault();
                    setIsLoading(true);
                    try {
                        await translate('hello', Language.auto, Language.zh_cn, { config });
                        setConfig(config, true);
                        updateServiceList(instanceKey);
                        onClose();
                    } catch (error) {
                        toast.error(t('config.service.test_failed') + error.toString(), { style: toastStyle });
                    } finally {
                        setIsLoading(false);
                    }
                }}
            >
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.translate.openai.request_path')}
                        isRequired
                        type='url'
                        placeholder='https://api.deepseek.com/chat/completions'
                        value={config.requestPath}
                        onValueChange={(requestPath) => setConfig({ ...config, requestPath })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        value={config.instanceName}
                        onValueChange={(instanceName) => setConfig({ ...config, instanceName })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.openai.api_key')}
                        type='password'
                        isRequired
                        autoComplete='off'
                        value={config.apiKey}
                        onValueChange={(apiKey) => setConfig({ ...config, apiKey })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.openai.model')}
                        isRequired
                        placeholder='deepseek-flash'
                        value={config.model}
                        onValueChange={(model) => setConfig({ ...config, model })}
                    />
                </div>
                <Button
                    type='submit'
                    color='primary'
                    fullWidth
                    isLoading={isLoading}
                >
                    {t('common.save')}
                </Button>
            </form>
        )
    );
}
