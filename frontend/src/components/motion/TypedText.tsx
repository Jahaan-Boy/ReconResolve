import { useTypewriter } from '@/hooks/useTypewriter';

interface TypedTextProps {
    text: string;
    charsPerSecond?: number;
}

/** Types the text out with a blinking caret. Mount it when it should start. */
export function TypedText({ text, charsPerSecond }: TypedTextProps) {
    const typed = useTypewriter(text, charsPerSecond);
    const done = typed.length === text.length;

    return (
        <>
            {typed}
            {done ? null : (
                <span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse bg-current"
                />
            )}
        </>
    );
}