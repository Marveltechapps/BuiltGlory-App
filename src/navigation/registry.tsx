import * as Auth from '../screens/auth';
import * as Home from '../screens/home';
import * as Buy from '../screens/buy';
import * as Buy2 from '../screens/buy2';
import * as Sell from '../screens/sell';
import * as Sell2 from '../screens/sell2';
import * as SellMissing from '../screens/sellMissing';
import * as Profile from '../screens/profile';
import * as Profile2 from '../screens/profile2';
import * as ProfileMissing from '../screens/profileMissing';
import * as Settings from '../screens/settings';
import * as SettingsMissing from '../screens/settingsMissing';
import * as Global from '../screens/global';
import { DevIndexScreen } from '../screens/devIndex';

export const SCREEN_GROUPS: { group: string; items: { key: string; label: string; Comp: React.ComponentType<any> }[] }[] = [
  {
    group: 'Auth & Onboarding',
    items: [
      { key: 'splash', label: 'Splash', Comp: Auth.SplashScreen },
      { key: 'onboarding', label: 'Onboarding', Comp: Auth.OnboardingScreen },
      { key: 'login', label: 'Login', Comp: Auth.LoginScreen },
      { key: 'otp', label: 'OTP Verify', Comp: Auth.OTPScreen },
      { key: 'profileSetup', label: 'Create Profile', Comp: Auth.ProfileSetupScreen },
      { key: 'locationType', label: 'Location + Type', Comp: Auth.LocationUserTypeScreen },
      { key: 'terms', label: 'Terms & Privacy', Comp: Auth.TermsScreen },
      { key: 'permissions', label: 'App Permissions', Comp: Auth.PermissionsScreen },
    ],
  },
  {
    group: 'Home & Navigation',
    items: [
      { key: 'home', label: 'Home', Comp: Home.HomeScreen },
      { key: 'search', label: 'Search', Comp: Home.SearchScreen },
      { key: 'featured', label: 'Featured List', Comp: Home.FeaturedListScreen },
      { key: 'upcoming', label: 'Upcoming List', Comp: Home.UpcomingListScreen },
      { key: 'help', label: 'Help & Support', Comp: Home.HelpScreen },
      { key: 'supportTickets', label: 'Support Tickets', Comp: Home.SupportTicketsScreen },
      { key: 'supportTicketChat', label: 'Support Ticket Chat', Comp: Home.SupportTicketChatScreen },
    ],
  },
  {
    group: 'Buy Flow',
    items: [
      { key: 'buyTypes', label: 'Property Type Selection', Comp: Buy.BuyTypeScreen },
      { key: 'filters', label: 'Filter', Comp: Buy.FilterScreen },
      { key: 'buyList', label: 'Listing Results', Comp: Buy.BuyListScreen },
      { key: 'propertyDetail', label: 'Property Detail', Comp: Buy.PropertyDetailScreen },
      { key: 'floorPlan', label: 'Floor Plan', Comp: Buy.FloorPlanScreen },
      { key: 'specs', label: 'Specifications', Comp: Buy.SpecsScreen },
      { key: 'advantages', label: 'Advantages', Comp: Buy.AdvantagesScreen },
      { key: 'vrTour', label: 'Virtual Tour', Comp: Buy.VRTourScreen },
      { key: 'aerial', label: 'Aerial View', Comp: Buy.AerialScreen },
      { key: 'shareProperty', label: 'Share Property', Comp: Buy.ShareScreen },
      { key: 'enquiry', label: 'Submit Enquiry', Comp: Buy.EnquiryScreen },
      { key: 'enquirySuccess', label: 'Enquiry Success', Comp: Buy.EnquirySuccessScreen },
      { key: 'visitCalendar', label: 'Schedule Visit', Comp: Buy.VisitCalendarScreen },
      { key: 'rescheduleVisit', label: 'Reschedule Visit', Comp: Buy.RescheduleVisitScreen },
      { key: 'visitConfirmation', label: 'Visit Confirmed', Comp: Buy.VisitConfirmationScreen },
      { key: 'nriVideoCall', label: 'NRI Video Call', Comp: Buy.NRIVideoCallScreen },
      { key: 'nriVideoConfirm', label: 'NRI Video Confirm', Comp: Buy.NRIVideoCallConfirmScreen },
      { key: 'documentsShared', label: 'Documents Shared', Comp: Buy2.DocumentsSharedScreen },
      { key: 'payment', label: 'Payment', Comp: Buy2.PaymentScreen },
      { key: 'paymentFailure', label: 'Payment Failure', Comp: Buy2.PaymentFailureScreen },
      { key: 'registrationDetails', label: 'Registration Details', Comp: Buy2.RegistrationDetailsScreen },
      { key: 'cancelEnquiry', label: 'Cancel Enquiry', Comp: Buy2.CancelEnquiryScreen },
      { key: 'propertyWithdrawn', label: 'Property Withdrawn', Comp: Buy2.PropertyWithdrawnScreen },
      { key: 'soldOut', label: 'Sold Out', Comp: Buy2.SoldOutScreen },
    ],
  },
  {
    group: 'Sell Flow',
    items: [
      { key: 'sellTypes', label: 'Sell — Property Type', Comp: Sell.SellTypeScreen },
      { key: 'sellIntent', label: 'Sell — Basic Details', Comp: Sell.SellBasicScreen },
      { key: 'sellAddress', label: 'Sell — Address', Comp: Sell.SellLocationScreen },
      { key: 'sellDetails', label: 'Sell — Property Details', Comp: SellMissing.SellPropertyDetailsScreen },
      { key: 'sellPhotos', label: 'Sell — Photo Upload', Comp: Sell.SellPhotosScreen },
      { key: 'sellAmenities', label: 'Sell — Amenities', Comp: Sell.SellAmenitiesScreen },
      { key: 'sellPrice', label: 'Sell — Expected Price', Comp: SellMissing.SellPriceEntryScreen },
      { key: 'sellReview', label: 'Sell — Review Listing', Comp: SellMissing.SellReviewScreen },
      { key: 'sellSuccess', label: 'Sell — Listing Success', Comp: SellMissing.SellSuccessScreen },
      { key: 'draftSuccess', label: 'Draft Save Success', Comp: Sell2.DraftSuccessScreen },
      { key: 'sellerDashboard', label: 'Seller Dashboard', Comp: Sell.SellerDashboardScreen },
      { key: 'editListing', label: 'Edit Listing', Comp: Sell2.EditListingScreen },
      { key: 'verificationStatus', label: 'Verification Status', Comp: Sell2.VerificationStatusScreen },
      { key: 'reupload', label: 'Re-upload', Comp: Sell2.ReuploadScreen },
      { key: 'offer', label: 'Offer Screen', Comp: Sell2.OfferScreen },
      { key: 'acceptNegotiate', label: 'Accept / Negotiate', Comp: Sell2.AcceptNegotiateScreen },
      { key: 'dealConfirmed', label: 'Deal Confirmed + Bank', Comp: Sell2.DealConfirmedScreen },
      { key: 'paymentSchedule', label: 'Payment Schedule', Comp: Sell2.PaymentScheduleScreen },
      { key: 'sellRegistration', label: 'Registration', Comp: Sell2.SellRegistrationScreen },
      { key: 'dealComplete', label: 'Deal Complete', Comp: Sell2.DealCompleteScreen },
      { key: 'rejectedListing', label: 'Rejected Listing', Comp: Sell2.RejectedListingScreen },
      { key: 'sellEnquiries', label: 'Seller Enquiries', Comp: Sell.SellEnquiriesScreen },
      { key: 'sellVisitMgmt', label: 'Seller Visits', Comp: Sell.SellVisitMgmtScreen },
      { key: 'sellChat', label: 'Negotiation Chat', Comp: Sell.SellChatScreen },
    ],
  },
  {
    group: 'Profile & Account',
    items: [
      { key: 'profile', label: 'Profile', Comp: Profile.ProfileScreen },
      { key: 'profileEdit', label: 'Edit Profile', Comp: Profile.ProfileEditScreen },
      { key: 'changePhone', label: 'Change Phone', Comp: ProfileMissing.ChangePhoneScreen },
      { key: 'myListings', label: 'My Listings', Comp: ProfileMissing.MyListingsScreen },
      { key: 'myVisits', label: 'My Visits', Comp: Profile2.MyVisitsScreen },
      { key: 'myDeals', label: 'My Deals', Comp: Profile2.MyDealsScreen },
      { key: 'listingDetail', label: 'Listing Detail', Comp: Profile2.ListingDetailScreen },
      { key: 'noListings', label: 'No Listings (empty)', Comp: Profile2.NoListingsScreen },
      { key: 'myEnquiries', label: 'My Enquiries', Comp: ProfileMissing.MyEnquiriesConsolidatedScreen },
      { key: 'enquiryDetail', label: 'Enquiry Detail', Comp: Profile2.EnquiryDetailScreen },
      { key: 'noEnquiries', label: 'No Enquiries (empty)', Comp: Profile2.NoEnquiriesScreen },
      { key: 'notifications', label: 'Notifications', Comp: Profile.NotificationsScreen },
      { key: 'pdfViewer', label: 'Document Viewer', Comp: Profile2.DocumentViewerScreen },
      { key: 'termsOfUse', label: 'Terms of Use', Comp: Profile.TermsOfUseScreen },
      { key: 'privacyPolicy', label: 'Privacy Policy', Comp: Profile.PrivacyPolicyScreen },
    ],
  },
  {
    group: 'Settings & Help',
    items: [
      { key: 'settingsMain', label: 'Settings Main', Comp: Settings.SettingsMainScreen },
      { key: 'notificationSettings', label: 'Notification Settings', Comp: Settings.NotificationSettingsScreen },
      { key: 'appSettings', label: 'App Settings', Comp: Settings.AppSettingsScreen },
      { key: 'accountSettings', label: 'Account Settings', Comp: Settings.AccountSettingsScreen },
      { key: 'accountDeletion', label: 'Delete Account', Comp: Settings.AccountDeletionScreen },
      { key: 'helpFaqs', label: 'Help & FAQs', Comp: Settings.HelpFaqsScreen },
      { key: 'faqTopic', label: 'FAQ Topic', Comp: Settings.FaqTopicScreen },
      { key: 'customerSupport', label: 'Customer Support', Comp: Settings.CustomerSupportScreen },
      { key: 'callUs', label: 'Call Us', Comp: Settings.CallUsScreen },
      { key: 'aboutUs', label: 'About Us', Comp: SettingsMissing.AboutUsScreen },
      { key: 'rateApp', label: 'Rate the App', Comp: SettingsMissing.RateAppScreen },
    ],
  },
  {
    group: 'Global',
    items: [
      { key: 'offline', label: 'No Internet', Comp: Global.OfflineScreen },
      { key: 'forceUpdate', label: 'Force Update', Comp: Global.ForceUpdateScreen },
      { key: 'maintenance', label: 'Maintenance', Comp: Global.MaintenanceScreen },
      { key: 'sessionExpiry', label: 'Session Expiry', Comp: Global.SessionExpiryScreen },
    ],
  },
  {
    group: 'Extras',
    items: [
      { key: 'favorites', label: 'Favorites', Comp: Buy.FavoritesScreen },
      { key: 'compare', label: 'Compare', Comp: Buy.CompareScreen },
      { key: 'advancedFilters', label: 'Advanced Filters', Comp: Buy.AdvancedFiltersScreen },
      { key: 'mapView', label: 'Map View', Comp: Buy.MapViewScreen },
      { key: 'offers', label: 'Offers & Deals', Comp: Profile.OffersScreen },
      { key: 'newsInsights', label: 'News & Insights', Comp: Profile.NewsInsightsScreen },
      { key: 'generalInfo', label: 'General Info', Comp: Profile.GeneralInfoScreen },
      { key: 'helpFeedback', label: 'Help & Feedback', Comp: Profile.HelpFeedbackScreen },
      { key: 'historyEnquiries', label: 'History & Enquiries', Comp: Profile.MyEnquiriesHistoryScreen },
      { key: 'devIndex', label: 'Dev — Screen Index', Comp: DevIndexScreen },
    ],
  },
];

export const ALL_SCREENS = SCREEN_GROUPS.flatMap((g) => g.items);
