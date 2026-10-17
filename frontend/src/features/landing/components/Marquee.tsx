interface MarqueeProps {
    items: readonly string[];
}

export function Marquee({ items }: MarqueeProps) {
    const loop = [...items, ...items];

    return (
        <div className="overflow-hidden border-y border-steel-200 bg-white py-5 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <ul className="flex w-max animate-marquee motion-reduce:animate-none hover:[animation-play-state:paused]">
                {loop.map((item, index) => (
                    <li
                        key={`${item}-${index}`}
                        aria-hidden={index >= items.length}
                        className="flex items-center gap-10 pr-10 text-sm font-medium whitespace-nowrap text-steel-500"
                    >
                        {item}
                        <span className="size-1 rounded-full bg-accent-400" />
                    </li>
                ))}
            </ul>
        </div>
    );
}