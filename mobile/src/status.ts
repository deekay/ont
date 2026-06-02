import { StatusTone } from "./theme";

/** Map a name lifecycle status to a display tone. */
export function nameStatusTone(status: string | undefined): StatusTone {
  switch ((status ?? "").toLowerCase()) {
    case "mature":
      return "success";
    case "claimed":
    case "pending":
    case "notice":
    case "notice_window":
      return "info";
    case "contested":
    case "auction":
    case "in_auction":
      return "warn";
    case "expired":
    case "released":
    case "invalidated":
      return "danger";
    default:
      return "neutral";
  }
}

/** Map an auction phase to a display tone. */
export function auctionPhaseTone(phase: string | undefined): StatusTone {
  switch ((phase ?? "").toLowerCase()) {
    case "live_bidding":
      return "success";
    case "soft_close":
      return "warn";
    case "awaiting_opening_bid":
      return "info";
    case "pending_unlock":
      return "neutral";
    case "settled":
    case "closed":
      return "accent";
    default:
      return "neutral";
  }
}

/** Map an event validation status to a display tone. */
export function eventTone(validationStatus: string | undefined): StatusTone {
  switch ((validationStatus ?? "").toLowerCase()) {
    case "applied":
    case "accepted":
      return "success";
    case "rejected":
    case "invalid":
      return "danger";
    default:
      return "neutral";
  }
}
