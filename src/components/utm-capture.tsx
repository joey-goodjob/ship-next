"use client";

import { useEffect } from "react";

import { getCookie, setCookie } from "@/lib/cookie";
import { deriveAcquisitionSourceLabel } from "@/lib/traffic";

const COOKIE_DAYS = 30;
const UTM_SOURCE_COOKIE = "utm_source";
const UTM_MEDIUM_COOKIE = "utm_medium";
const UTM_CAMPAIGN_COOKIE = "utm_campaign";
const REFERRER_COOKIE = "traffic_referrer";
const ACQUISITION_SOURCE_COOKIE = "acquisition_source";
const GCLID_COOKIE = "gclid";
const MSCLKID_COOKIE = "msclkid";
const FBCLID_COOKIE = "fbclid";

function sanitizeToken(value: string, maxLength = 120) {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();

  return decoded
    .trim()
    .replace(/[^\w\-.:]/g, "")
    .slice(0, maxLength);
}

function sanitizeUrl(value: string) {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();

  try {
    return new URL(decoded).toString().slice(0, 500);
  } catch {
    return "";
  }
}

function readDecodedCookie(name: string) {
  const value = getCookie(name);
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function UtmCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utmSource = sanitizeToken(params.get("utm_source") || "");
    const utmMedium = sanitizeToken(params.get("utm_medium") || "");
    const utmCampaign = sanitizeToken(params.get("utm_campaign") || "", 160);
    const gclid = sanitizeToken(params.get("gclid") || "", 160);
    const msclkid = sanitizeToken(params.get("msclkid") || "", 160);
    const fbclid = sanitizeToken(params.get("fbclid") || "", 160);
    const referrer = sanitizeUrl(document.referrer || "");

    const hasExplicitAttribution =
      !!utmSource ||
      !!utmMedium ||
      !!utmCampaign ||
      !!gclid ||
      !!msclkid ||
      !!fbclid;

    const nextLabel = deriveAcquisitionSourceLabel({
      utmSource,
      utmMedium,
      referrer,
      gclid,
      msclkid,
      fbclid,
    });
    const existingLabel = readDecodedCookie(ACQUISITION_SOURCE_COOKIE);
    const shouldReplaceAttribution =
      hasExplicitAttribution ||
      !existingLabel ||
      existingLabel === "Direct" ||
      existingLabel.startsWith("Referral (");

    if (shouldReplaceAttribution && nextLabel) {
      setCookie(ACQUISITION_SOURCE_COOKIE, encodeURIComponent(nextLabel), COOKIE_DAYS);
    }
    if (shouldReplaceAttribution && utmSource) {
      setCookie(UTM_SOURCE_COOKIE, encodeURIComponent(utmSource), COOKIE_DAYS);
    }
    if (shouldReplaceAttribution && utmMedium) {
      setCookie(UTM_MEDIUM_COOKIE, encodeURIComponent(utmMedium), COOKIE_DAYS);
    }
    if (shouldReplaceAttribution && utmCampaign) {
      setCookie(UTM_CAMPAIGN_COOKIE, encodeURIComponent(utmCampaign), COOKIE_DAYS);
    }
    if (shouldReplaceAttribution && gclid) {
      setCookie(GCLID_COOKIE, encodeURIComponent(gclid), COOKIE_DAYS);
    }
    if (shouldReplaceAttribution && msclkid) {
      setCookie(MSCLKID_COOKIE, encodeURIComponent(msclkid), COOKIE_DAYS);
    }
    if (shouldReplaceAttribution && fbclid) {
      setCookie(FBCLID_COOKIE, encodeURIComponent(fbclid), COOKIE_DAYS);
    }
    if (referrer && (!getCookie(REFERRER_COOKIE) || shouldReplaceAttribution)) {
      setCookie(REFERRER_COOKIE, encodeURIComponent(referrer), COOKIE_DAYS);
    }
  }, []);

  return null;
}
