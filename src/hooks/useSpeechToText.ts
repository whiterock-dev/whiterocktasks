/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechToTextOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  clearTranscriptOnStart?: boolean;
  onResult?: (text: string) => void;
}

interface SpeechToTextReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  isSupported: boolean;
  error: string | null;
}

export function useSpeechToText(
  options: SpeechToTextOptions = {}
): SpeechToTextReturn {
  const {
    lang = 'en-IN',
    continuous = true,
    interimResults = true,
    clearTranscriptOnStart = false,
    onResult,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const manuallyStoppedRef = useRef(false);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const getSpeechRecognition = () => {
    if (typeof window === 'undefined') return null;

    return (
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  };

  const isSupported = !!getSpeechRecognition();

  const cleanupRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch { }
    }

    recognitionRef.current = null;
  }, []);

  const createRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser.');
      return null;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];

        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      setInterimTranscript(interimText);

      if (finalText) {
        const cleaned = finalText.trim();

        if (onResultRef.current) {
          onResultRef.current(cleaned);
        } else {
          setTranscript(prev =>
            prev ? `${prev} ${cleaned}` : cleaned
          );
        }
      }
    };

    recognition.onerror = (event: any) => {
      switch (event.error) {
        case 'aborted':
          return;

        case 'no-speech':
          // Chrome commonly fires this during pauses.
          return;

        case 'not-allowed':
        case 'service-not-allowed':
          setError('Microphone permission denied.');
          manuallyStoppedRef.current = true;
          break;

        case 'audio-capture':
          setError('No microphone detected.');
          manuallyStoppedRef.current = true;
          break;

        default:
          setError(`Speech recognition error: ${event.error}`);
          manuallyStoppedRef.current = true;
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');

      if (
        continuous &&
        !manuallyStoppedRef.current
      ) {
        restartTimeoutRef.current = setTimeout(() => {
          if (manuallyStoppedRef.current) return;

          try {
            const freshRecognition = createRecognition();

            if (!freshRecognition) return;

            recognitionRef.current = freshRecognition;
            freshRecognition.start();
          } catch {
            setError('Failed to restart speech recognition.');
          }
        }, 250);
      } else {
        cleanupRecognition();
      }
    };

    return recognition;
  }, [lang, continuous, interimResults, cleanupRecognition]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    manuallyStoppedRef.current = false;

    if (clearTranscriptOnStart) {
      setTranscript('');
    }

    setInterimTranscript('');
    setError(null);

    cleanupRecognition();

    const recognition = createRecognition();

    if (!recognition) return;

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError('Failed to start speech recognition.');
    }
  }, [
    isSupported,
    clearTranscriptOnStart,
    cleanupRecognition,
    createRecognition,
  ]);

  const stopListening = useCallback(() => {
    manuallyStoppedRef.current = true;

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    cleanupRecognition();

    setIsListening(false);
    setInterimTranscript('');
  }, [cleanupRecognition]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      manuallyStoppedRef.current = true;

      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }

      cleanupRecognition();
    };
  }, [cleanupRecognition]);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
    isSupported,
    error,
  };
}