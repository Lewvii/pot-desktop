import { Button, Input } from '@nextui-org/react';
import React, { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { Language, tts } from './index';

export function Config({ instanceKey, updateServiceList, onClose }) {
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const [isLoading, setIsLoading] = useState(false);
    const [config, setConfig] = useConfig(
        instanceKey,
        { [INSTANCE_NAME_CONFIG_KEY]: t('services.tts.edge_tts.title'), voice: '' },
        { sync: false }
    );

    return (
        config !== null && (
            <>
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={config[INSTANCE_NAME_CONFIG_KEY] || ''}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => setConfig({ ...config, [INSTANCE_NAME_CONFIG_KEY]: value })}
                    />
                </div>
                <p className='text-sm text-default-500'>{t('services.tts.edge_tts.description')}</p>
                <div className='config-item'>
                    <Input
                        label={t('services.tts.edge_tts.voice')}
                        labelPlacement='outside-left'
                        value={config.voice || ''}
                        placeholder={t('services.tts.edge_tts.automatic')}
                        description={t('services.tts.edge_tts.voice_help')}
                        variant='bordered'
                        onValueChange={(voice) => setConfig({ ...config, voice })}
                    />
                </div>
                <Button
                    isLoading={isLoading}
                    fullWidth
                    color='primary'
                    onPress={async () => {
                        setIsLoading(true);
                        try {
                            await tts('Hello', Language.en, { config });
                            setConfig(config, true);
                            updateServiceList(instanceKey);
                            onClose();
                        } catch (error) {
                            toast.error(t('config.service.test_failed') + String(error), { style: toastStyle });
                        } finally {
                            setIsLoading(false);
                        }
                    }}
                >
                    {t('common.save')}
                </Button>
            </>
        )
    );
}
