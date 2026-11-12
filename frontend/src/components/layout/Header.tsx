import { useEffect, useId, useState } from 'react';
import { Menu, Shield, X } from 'lucide-react';
import { motion, useScroll, useSpring } from 'motion/react';
import { SITE } from '@/config/site';
import { Logo } from '@/components/brand/Logo';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EASE_OUT } from '@/lib/motion';

export interface NavItem {
    label: string;
    href: string;
}

interface HeaderProps {
    links: readonly NavItem[];
    onNavigateConsole?: () => void;
}

export function Header({ links, onNavigateConsole }: HeaderProps) {
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const { scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    return (
        <motion.header
            initial={{ y: -64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
            className="sticky top-0 z-40 border-b border-steel-200/70 bg-steel-50/75 backdrop-blur-xl"
        >
            <Container className="flex h-16 items-center justify-between">
                <a href="#top" aria-label={`${SITE.name} home`}>
                    <Logo />
                </a>

                <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
                    {links.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="relative rounded-lg px-3 py-2 text-sm font-medium text-steel-600 transition-colors hover:text-steel-900 after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-accent-600 after:transition-transform after:duration-300 hover:after:scale-x-100"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="hidden md:flex items-center gap-3">
                    {onNavigateConsole && (
                        <button
                            type="button"
                            onClick={onNavigateConsole}
                            onMouseEnter={() => {
                                import('@/features/console/OperatorConsolePage');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-steel-200 bg-white px-3 py-2 text-xs font-semibold text-steel-800 shadow-2xs hover:bg-steel-50 hover:text-accent-600 transition-colors cursor-pointer"
                        >
                            <Shield className="size-3.5 text-accent-600" />
                            <span>Operator Console</span>
                        </button>
                    )}
                    <ButtonLink href={SITE.contactHref}>Request a demo</ButtonLink>
                </div>

                <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center rounded-lg text-steel-700 hover:bg-steel-100 focus-visible:outline-2 focus-visible:outline-accent-600 md:hidden"
                    aria-expanded={open}
                    aria-controls={menuId}
                    aria-label={open ? 'Close menu' : 'Open menu'}
                    onClick={() => setOpen((value) => !value)}
                >
                    {open ? (
                        <X className="size-5" aria-hidden="true" />
                    ) : (
                        <Menu className="size-5" aria-hidden="true" />
                    )}
                </button>
            </Container>

            {open ? (
                <div id={menuId} className="border-t border-steel-200 bg-steel-50 md:hidden">
                    <Container className="flex flex-col gap-1 py-4">
                        {links.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                onClick={() => setOpen(false)}
                                className="rounded-lg px-3 py-2.5 text-sm font-medium text-steel-700 hover:bg-steel-100"
                            >
                                {link.label}
                            </a>
                        ))}
                        {onNavigateConsole && (
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    onNavigateConsole();
                                }}
                                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-accent-700 bg-accent-50/80 hover:bg-accent-100/80 cursor-pointer text-left"
                            >
                                <Shield className="size-4 text-accent-600" />
                                <span>Operator Console</span>
                            </button>
                        )}
                        <ButtonLink href={SITE.contactHref} className="mt-2" onClick={() => setOpen(false)}>
                            Request a demo
                        </ButtonLink>
                    </Container>
                </div>
            ) : null}

            <motion.div
                aria-hidden="true"
                style={{ scaleX: progress }}
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent-600"
            />
        </motion.header>
    );
}