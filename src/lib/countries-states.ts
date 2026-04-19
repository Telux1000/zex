/**
 * Countries and states/regions for address dropdowns.
 * Country codes are ISO 3166-1 alpha-2. State codes/names per country.
 */

export type CountryOption = { code: string; name: string };
export type StateOption = { code: string; name: string };

function buildCountryList(): CountryOption[] {
  const fallback: CountryOption[] = [
    { code: 'AU', name: 'Australia' },
    { code: 'CA', name: 'Canada' },
    { code: 'DE', name: 'Germany' },
    { code: 'ES', name: 'Spain' },
    { code: 'FR', name: 'France' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'IE', name: 'Ireland' },
    { code: 'IN', name: 'India' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'US', name: 'United States' },
  ];

  try {
    const supportedValuesOf = (Intl as any).supportedValuesOf as undefined | ((key: string) => string[]);
    const codes: string[] = supportedValuesOf?.('region') ?? [];
    if (!codes.length) return fallback;
    const display = new Intl.DisplayNames(['en'], { type: 'region' });
    return codes
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .map((code) => ({ code, name: display.of(code) ?? code }))
      .filter((c) => c.name && c.name !== c.code)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return fallback;
  }
}

export const COUNTRIES: CountryOption[] = buildCountryList();

const US_STATES: StateOption[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
];

const CA_PROVINCES: StateOption[] = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' }, { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' }, { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' }, { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' }, { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' }, { code: 'YT', name: 'Yukon' },
];

const UK_COUNTRIES: StateOption[] = [
  { code: 'ENG', name: 'England' }, { code: 'SCT', name: 'Scotland' }, { code: 'WLS', name: 'Wales' },
  { code: 'NIR', name: 'Northern Ireland' },
];

const AU_STATES: StateOption[] = [
  { code: 'ACT', name: 'Australian Capital Territory' }, { code: 'NSW', name: 'New South Wales' },
  { code: 'NT', name: 'Northern Territory' }, { code: 'QLD', name: 'Queensland' },
  { code: 'SA', name: 'South Australia' }, { code: 'TAS', name: 'Tasmania' },
  { code: 'VIC', name: 'Victoria' }, { code: 'WA', name: 'Western Australia' },
];

const DE_STATES: StateOption[] = [
  { code: 'BW', name: 'Baden-Württemberg' }, { code: 'BY', name: 'Bavaria' }, { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' }, { code: 'HB', name: 'Bremen' }, { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hesse' }, { code: 'MV', name: 'Mecklenburg-Vorpommern' }, { code: 'NI', name: 'Lower Saxony' },
  { code: 'NW', name: 'North Rhine-Westphalia' }, { code: 'RP', name: 'Rhineland-Palatinate' }, { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Saxony' }, { code: 'ST', name: 'Saxony-Anhalt' }, { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thuringia' },
];

const FR_REGIONS: StateOption[] = [
  { code: 'ARA', name: 'Auvergne-Rhône-Alpes' }, { code: 'BFC', name: 'Bourgogne-Franche-Comté' },
  { code: 'BRE', name: 'Brittany' }, { code: 'CVL', name: 'Centre-Val de Loire' }, { code: 'COR', name: 'Corsica' },
  { code: 'GES', name: 'Grand Est' }, { code: 'HDF', name: 'Hauts-de-France' }, { code: 'IDF', name: 'Île-de-France' },
  { code: 'NOR', name: 'Normandy' }, { code: 'NAQ', name: 'Nouvelle-Aquitaine' }, { code: 'OCC', name: 'Occitanie' },
  { code: 'PDL', name: 'Pays de la Loire' }, { code: 'PAC', name: 'Provence-Alpes-Côte d\'Azur' },
];

const IN_STATES: StateOption[] = [
  { code: 'AN', name: 'Andhra Pradesh' }, { code: 'AR', name: 'Arunachal Pradesh' }, { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' }, { code: 'CT', name: 'Chhattisgarh' }, { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' }, { code: 'HR', name: 'Haryana' }, { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'JK', name: 'Jammu and Kashmir' }, { code: 'JH', name: 'Jharkhand' }, { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' }, { code: 'MP', name: 'Madhya Pradesh' }, { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' }, { code: 'ML', name: 'Meghalaya' }, { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' }, { code: 'OR', name: 'Odisha' }, { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' }, { code: 'SK', name: 'Sikkim' }, { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TG', name: 'Telangana' }, { code: 'TR', name: 'Tripura' }, { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UT', name: 'Uttarakhand' }, { code: 'WB', name: 'West Bengal' },
];

const NL_PROVINCES: StateOption[] = [
  { code: 'DR', name: 'Drenthe' }, { code: 'FL', name: 'Flevoland' }, { code: 'FR', name: 'Friesland' },
  { code: 'GE', name: 'Gelderland' }, { code: 'GR', name: 'Groningen' }, { code: 'LI', name: 'Limburg' },
  { code: 'NB', name: 'North Brabant' }, { code: 'NH', name: 'North Holland' }, { code: 'OV', name: 'Overijssel' },
  { code: 'UT', name: 'Utrecht' }, { code: 'ZE', name: 'Zeeland' }, { code: 'ZH', name: 'South Holland' },
];

const ES_PROVINCES: StateOption[] = [
  { code: 'AN', name: 'Andalusia' }, { code: 'AR', name: 'Aragon' }, { code: 'AS', name: 'Asturias' },
  { code: 'CB', name: 'Cantabria' }, { code: 'CL', name: 'Castile and León' }, { code: 'CM', name: 'Castilla-La Mancha' },
  { code: 'CT', name: 'Catalonia' }, { code: 'CE', name: 'Ceuta' }, { code: 'EX', name: 'Extremadura' },
  { code: 'GA', name: 'Galicia' }, { code: 'IB', name: 'Balearic Islands' }, { code: 'MC', name: 'Region of Murcia' },
  { code: 'MD', name: 'Madrid' }, { code: 'ME', name: 'Melilla' }, { code: 'NC', name: 'Navarre' },
  { code: 'PV', name: 'Basque Country' }, { code: 'RI', name: 'La Rioja' }, { code: 'VC', name: 'Valencian Community' },
];

const NZ_REGIONS: StateOption[] = [
  { code: 'AUK', name: 'Auckland' }, { code: 'BOP', name: 'Bay of Plenty' }, { code: 'CAN', name: 'Canterbury' },
  { code: 'GIS', name: 'Gisborne' }, { code: 'HKB', name: "Hawke's Bay" }, { code: 'MWT', name: 'Manawatū-Whanganui' },
  { code: 'MBH', name: 'Marlborough' }, { code: 'NSN', name: 'Nelson' }, { code: 'NTL', name: 'Northland' },
  { code: 'OTA', name: 'Otago' }, { code: 'STL', name: 'Southland' }, { code: 'TKI', name: 'Taranaki' },
  { code: 'TAS', name: 'Tasman' }, { code: 'WKO', name: 'Waikato' }, { code: 'WGN', name: 'Wellington' },
  { code: 'WTC', name: 'West Coast' },
];

const IE_COUNTIES: StateOption[] = [
  { code: 'CW', name: 'Carlow' }, { code: 'CN', name: 'Cavan' }, { code: 'CE', name: 'Clare' },
  { code: 'CO', name: 'Cork' }, { code: 'DL', name: 'Donegal' }, { code: 'D', name: 'Dublin' },
  { code: 'G', name: 'Galway' }, { code: 'KY', name: 'Kerry' }, { code: 'KE', name: 'Kildare' },
  { code: 'KK', name: 'Kilkenny' }, { code: 'LS', name: 'Laois' }, { code: 'LM', name: 'Leitrim' },
  { code: 'LK', name: 'Limerick' }, { code: 'LD', name: 'Longford' }, { code: 'LH', name: 'Louth' },
  { code: 'MO', name: 'Mayo' }, { code: 'MH', name: 'Meath' }, { code: 'MN', name: 'Monaghan' },
  { code: 'OY', name: 'Offaly' }, { code: 'RN', name: 'Roscommon' }, { code: 'SO', name: 'Sligo' },
  { code: 'TA', name: 'Tipperary' }, { code: 'WD', name: 'Waterford' }, { code: 'WH', name: 'Westmeath' },
  { code: 'WX', name: 'Wexford' }, { code: 'WW', name: 'Wicklow' },
];

const STATES_BY_COUNTRY: Record<string, StateOption[]> = {
  US: US_STATES,
  CA: CA_PROVINCES,
  GB: UK_COUNTRIES,
  AU: AU_STATES,
  DE: DE_STATES,
  FR: FR_REGIONS,
  IN: IN_STATES,
  NL: NL_PROVINCES,
  ES: ES_PROVINCES,
  NZ: NZ_REGIONS,
  IE: IE_COUNTIES,
};

export function getStatesForCountry(countryCode: string): StateOption[] {
  if (!countryCode || countryCode === 'OTHER') return [];
  return STATES_BY_COUNTRY[countryCode] ?? [];
}

export function getCountryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function normalizeCountryCode(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  const v = value.trim();
  const byCode = COUNTRIES.find((c) => c.code === v.toUpperCase());
  if (byCode) return byCode.code;
  const byName = COUNTRIES.find((c) => c.name.toLowerCase() === v.toLowerCase());
  return byName?.code ?? '';
}

export function getStateName(countryCode: string, stateCode: string): string {
  const states = getStatesForCountry(countryCode);
  return states.find((s) => s.code === stateCode)?.name ?? stateCode;
}
