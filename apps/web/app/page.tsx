import Link from 'next/link';
import { STORE_LINKS } from '../lib/api';

export const revalidate = 3600;

export default function HomePage() {
  return (
    <article>
      <h1>Find out where your artists are playing.</h1>

      <p className="muted">
        Look up any artist and see where they are playing, who else is on the bill, how to get
        tickets and how to get to the door. South Africa first.
      </p>

      <p className="row" style={{ marginTop: 24 }}>
        <a className="cta" href={STORE_LINKS.ios} rel="nofollow">
          Download for iPhone
        </a>
        <a className="cta cta-secondary" href={STORE_LINKS.android} rel="nofollow">
          Download for Android
        </a>
      </p>

      <h2>What Onstage does</h2>
      <ul className="list">
        <li className="card">
          <strong>Announced shows, not guesses.</strong>
          <div className="faint">
            Onstage lists confirmed appearances from ticketing partners, aggregators and a curation
            team working the local scene. It never tracks where an artist actually is.
          </div>
        </li>
        <li className="card">
          <strong>The whole bill, not just the headliner.</strong>
          <div className="faint">
            Every support act is a link to their own profile. Most people find their next favourite
            artist by tapping a name they did not recognise.
          </div>
        </li>
        <li className="card">
          <strong>Tickets and the ride there.</strong>
          <div className="faint">
            Ticket links go to the official provider — Onstage never takes a payment. Directions and
            ride links open your maps app, Bolt or Uber with the venue already filled in.
          </div>
        </li>
        <li className="card">
          <strong>A thread per show.</strong>
          <div className="faint">
            Ask what time doors open, find out who else is going, or sort out a spare ticket.
            Onstage hosts the conversation and is not a party to any sale between users.
          </div>
        </li>
      </ul>

      <p className="faint" style={{ marginTop: 32 }}>
        Looking for a specific artist or show? Every artist and event has its own page — follow a
        link from a search engine or share one from the app.
      </p>

      <p>
        <Link href="/privacy">How we handle your data</Link>
      </p>
    </article>
  );
}
