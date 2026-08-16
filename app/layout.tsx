import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { currentUser } from '@/lib/auth';

const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-public-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'CapitolPass — plan a Capitol field trip',
    template: '%s · CapitolPass',
  },
  description:
    'One intake, correct routing, and real logistics for school trips to the US Capitol. Built for teachers who do not have a parent volunteer who used to work on the Hill.',
};

async function Header() {
  const user = await currentUser();

  const links: Array<{ href: string; label: string }> = user
    ? user.role === 'staff'
      ? [
          { href: '/office', label: 'Request queue' },
          { href: '/rules', label: 'The rules' },
        ]
      : [
          { href: '/teacher', label: 'My trips' },
          { href: '/rules', label: 'The rules' },
          { href: '/venues', label: 'Lunch' },
        ]
    : [
        { href: '/rules', label: 'The rules' },
        { href: '/join', label: 'Join a trip' },
        { href: '/office/claim', label: 'For congressional offices' },
      ];

  return (
    <header className="border-b-4 border-accent-600 bg-ink-950 text-paper-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link
          href="/"
          className="text-xl font-bold text-paper-50 no-underline hover:text-paper-50 hover:underline"
        >
          Capitol<span className="text-accent-500">Pass</span>
        </Link>

        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-paper-100 no-underline hover:text-white hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              {user ? (
                <form action="/api/signout" method="post">
                  <button
                    type="submit"
                    className="cursor-pointer border-none bg-transparent p-0 text-paper-100 underline hover:text-white"
                  >
                    Sign out
                  </button>
                </form>
              ) : (
                <Link href="/signin" className="text-paper-100 no-underline hover:text-white hover:underline">
                  Sign in
                </Link>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-300 bg-paper-200">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="font-bold text-ink-950">Where the data comes from</h2>
            <ul className="mt-2 space-y-1">
              <li>School directory — NCES Common Core of Data</li>
              <li>Districts — US Census Geocoder</li>
              <li>
                Members —{' '}
                <a href="https://github.com/unitedstates/congress-legislators" rel="noreferrer">
                  congress-legislators
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-bold text-ink-950">What is live, what is not</h2>
            <p className="mt-2">
              The office queue is a working system with seeded demo offices. The lunch directory is
              researched public information. There are <strong>no restaurant partnerships</strong>{' '}
              — the partner page is a signup funnel with nobody in it yet.
            </p>
          </div>
          <div>
            <h2 className="font-bold text-ink-950">Honesty</h2>
            <p className="mt-2">
              CapitolPass never emails a congressional office on your behalf. Every request is sent
              by you, through the channel that office actually monitors.{' '}
              <Link href="/rules">See the rules we encode</Link>.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <Header />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
