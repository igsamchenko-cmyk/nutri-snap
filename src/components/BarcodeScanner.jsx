import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const HINTS = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E
  ]]
]);

export default function BarcodeScanner({ onDetected, onError, onClose, onFallback }) {
  const videoRef = useRef(null);
  const [starting, setStarting] = useState(true);

  // Тримаємо колбеки в ref, щоб ефект з камерою не перезапускався
  // при кожному ре-рендері батьківського компонента (інлайн-функції в props).
  const onDetectedRef = useRef(onDetected);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onDetectedRef.current = onDetected;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const reader = new BrowserMultiFormatReader(HINTS);
    let controls = null;
    let done = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        (result, err, ctrl) => {
          controls = ctrl;
          setStarting(false);
          if (result && !done) {
            done = true;
            ctrl.stop();
            onDetectedRef.current?.(result.getText());
          }
        }
      )
      .catch(e => {
        setStarting(false);
        onErrorRef.current?.(
          e?.name === 'NotAllowedError'
            ? 'Немає доступу до камери. Дозвольте камеру в налаштуваннях браузера.'
            : 'Не вдалося запустити камеру.'
        );
      });

    return () => controls?.stop();
  }, []);

  return (
    <div className="barcode-scanner-overlay">
      <video ref={videoRef} className="barcode-scanner-video" muted playsInline />
      <div className="barcode-scanner-frame" aria-hidden="true" />
      {starting && <p className="barcode-scanner-status">Запуск камери...</p>}
      <div className="barcode-scanner-actions">
        <button type="button" className="btn-secondary" onClick={onFallback}>
          Не виходить, сканувати фото
        </button>
        <button type="button" className="btn-primary" onClick={onClose}>
          Закрити
        </button>
      </div>
    </div>
  );
}
