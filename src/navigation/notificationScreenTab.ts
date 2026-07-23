const BUY_TAB_SCREENS = new Set([
  'buyTypes', 'filters', 'buyList', 'propertyDetail', 'floorPlan', 'specs', 'advantages',
  'vrTour', 'aerial', 'shareProperty', 'enquiry', 'enquirySuccess', 'visitCalendar',
  'rescheduleVisit', 'visitConfirmation', 'nriVideoCall', 'nriVideoConfirm',
  'documentsShared', 'payment', 'paymentFailure', 'registrationDetails', 'cancelEnquiry',
  'propertyWithdrawn', 'soldOut', 'favorites', 'compare', 'advancedFilters', 'mapView',
]);

const SELL_TAB_SCREENS = new Set([
  'sellTypes', 'sellIntent', 'sellAddress', 'sellDetails', 'sellPhotos', 'sellAmenities',
  'sellPrice', 'sellReview', 'sellSuccess', 'draftSuccess', 'sellerDashboard', 'editListing',
  'verificationStatus', 'reupload', 'offer', 'acceptNegotiate', 'dealConfirmed',
  'paymentSchedule', 'sellRegistration', 'dealComplete', 'rejectedListing', 'sellEnquiries',
  'sellVisitMgmt', 'sellChat',
]);

const PROFILE_TAB_SCREENS = new Set([
  'profile', 'profileEdit', 'changePhone', 'myListings', 'myVisits', 'myDeals',
  'listingDetail', 'noListings', 'myEnquiries', 'enquiryDetail', 'noEnquiries',
  'notifications', 'pdfViewer', 'termsOfUse', 'privacyPolicy', 'offers', 'newsInsights',
  'generalInfo', 'helpFeedback', 'historyEnquiries', 'settingsMain', 'notificationSettings',
  'appSettings', 'accountSettings', 'accountDeletion', 'helpFaqs', 'faqTopic',
  'customerSupport', 'callUs', 'aboutUs', 'rateApp',
]);

export function resolveNotificationTab(screen: string): string {
  if (BUY_TAB_SCREENS.has(screen)) return 'BuyTab';
  if (SELL_TAB_SCREENS.has(screen)) return 'SellTab';
  if (PROFILE_TAB_SCREENS.has(screen)) return 'ProfileTab';
  return 'HomeTab';
}
