import { TextareaHTMLAttributes, useCallback, useEffect, useLayoutEffect, useRef } from "react";

// Grows with its content instead of scrolling; `rows` is the minimum height.
export function AutoGrowTextarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const ref = useRef<HTMLTextAreaElement>(null);

    const fit = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    }, []);

    useLayoutEffect(() => fit(), [fit, props.value]);

    // A narrower column re-wraps the text, so the height has to follow the width too.
    useEffect(() => {
        window.addEventListener("resize", fit);
        return () => window.removeEventListener("resize", fit);
    }, [fit]);

    return <textarea ref={ref} className={`${className} resize-none overflow-y-hidden`} {...props} />;
}
