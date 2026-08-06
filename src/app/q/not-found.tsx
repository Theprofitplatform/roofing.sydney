import { Icon } from "@/components/crm/icon";

/**
 * The answer to every token that does not resolve — malformed, wrong, or for a
 * quote that was never issued. One page, one wording: a portal that said
 * "expired" for one and "not found" for another would be a way to test tokens.
 */
export default function PortalNotFound() {
  return (
    <div className="qmiss">
      <span className="qmiss__mark" aria-hidden="true">
        <Icon name="file-search" size={24} />
      </span>
      <h1>We couldn&rsquo;t find that quote</h1>
      <p>
        The link may have been copied incompletely, or the quote may have been withdrawn. Check the
        link in your email — or give us a call and we&rsquo;ll send you a fresh one.
      </p>
    </div>
  );
}
