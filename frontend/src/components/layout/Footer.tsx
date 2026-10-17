import { SITE } from '@/config/site';
import { Logo } from '@/components/brand/Logo';
import { Container } from '@/components/layout/Container';
import type { NavItem } from '@/components/layout/Header';

interface FooterProps {
    links: readonly NavItem[];
}

export function Footer({ links }: FooterProps) {
    return (
        <footer className="border-t border-steel-200 bg-white">
            <Container className="flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
                <div className="max-w-sm">
                    <Logo />
                    <p className="mt-4 text-sm leading-6 text-steel-600">{SITE.description}</p>
                </div>
                <nav aria-label="Footer">
                    <ul className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                        {links.map((link) => (
                            <li key={link.href}>
                                <a href={link.href} className="text-steel-600 transition-colors hover:text-steel-900">
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </Container>

            <div aria-hidden="true" className="overflow-hidden select-none">
                <Container>
                    <p className="bg-linear-to-b from-steel-300 to-steel-50 bg-clip-text pb-2 text-center text-[clamp(4rem,19vw,15rem)] leading-[0.9] font-semibold tracking-tighter text-transparent">
                        {SITE.name}
                    </p>
                </Container>
            </div>

            <div className="border-t border-steel-200">
                <Container className="py-6 text-xs leading-5 text-steel-500">
                    © {new Date().getFullYear()} {SITE.name}. An independent project, not affiliated with
                    PayPal.
                </Container>
            </div>
        </footer>
    );
}