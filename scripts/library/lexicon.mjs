// Slovníky pro automatickou kontrolu textů knihovny. Jsou záměrně konzervativní:
// co v nich chybí, kontrola nahlásí a autor textu to musí vyřešit (přepsat větu nebo doplnit slovník
// po zvážení). Nejde o morfologický analyzátor ani o důkaz správnosti – jen o pojistku proti přehlédnutí.

// --- Jména osob (smí stát i uvnitř věty s velkým písmenem; zeměpisná jména ne) --------------------------
export const FIRST_NAMES = new Set([
  'adam', 'alena', 'anna', 'aneta', 'barbora', 'dana', 'david', 'ema', 'eva', 'filip', 'hana', 'honza', 'jakub', 'jana',
  'jan', 'jirka', 'karel', 'kuba', 'lenka', 'lucie', 'marek', 'marie', 'martin', 'michal', 'milan', 'olga', 'ota',
  'pavel', 'petr', 'petra', 'radek', 'tomáš', 'tereza', 'vojta', 'zuzana', 'ivo', 'iva', 'jára', 'alan', 'adéla',
  'amálie', 'daniel', 'denis', 'dominik', 'elena', 'erik', 'jitka', 'kamila', 'klára', 'ladislav', 'libor', 'lukáš',
  'miloš', 'monika', 'nela', 'nikola', 'oto', 'robert', 'roman', 'sára', 'sofie', 'šárka', 'štěpán', 'teodor', 'viktor',
  'vlasta', 'zdeněk', 'bára', 'tonda', 'ondra', 'matěj', 'rozálie', 'káča', 'kája', 'jiří', 'jirka', 'hanka', 'lada', 'nora', 'rosa', 'lara', 'mara', 'marta', 'soňa', 'vojtěch',
]);

// --- Zeměpisná jména: vždy vyžadují označení (i na začátku věty, kde velké písmeno nic neprozradí) -------------
export const PLACE_NAMES = new Set([
  'praha', 'brno', 'ostrava', 'plzeň', 'liberec', 'olomouc', 'pardubice', 'zlín', 'opava', 'jihlava', 
  'čechy', 'morava', 'slezsko', 'polsko', 'slovensko', 'německo', 'rakousko', 'itálie', 'francie', 'španělsko', 'anglie',
  'evropa', 'asie', 'afrika', 'amerika', 'austrálie', 'labe', 'vltava', 'morava', 'odra', 'dunaj', 'sněžka', 'říp',
  'krkonoše', 'šumava', 'beskydy', 'jeseníky', 'orlice', 'sázava', 'berounka', 'ohře', 'jizera', 'úpa', 'dyje',
]);

// --- Funkční slova: nehlásí se u nich znělost na konci/uvnitř ani koncové i/y ---------------------------------
export const FUNC = new Set([
  'a', 'i', 'o', 'u', 'k', 's', 'z', 'v', 've', 'ze', 'se', 'na', 'do', 'od', 'po', 'za', 'při', 'pro', 'před', 'pod',
  'nad', 'bez', 'ob', 'než', 'ale', 'že', 'kdy', 'kde', 'kdo', 'co', 'jak', 'už', 'tak', 'jen', 'také', 'však', 'jako',
  'jsem', 'jsi', 'je', 'jsou', 'jste', 'jsme', 'ten', 'to', 'ta', 'ho', 'mu', 'ji', 'jí', 'ne', 'ani', 'nebo', 'když',
  'kdyby', 'protože', 'který', 'která', 'které', 'kterou', 'kteří', 'kterého', 'tam', 'tu', 'zde', 'tady', 'pak', 'teď',
  'ještě', 'dnes', 'vždy', 'někdy', 'nikdy', 'nikdo', 'někdo', 'nic', 'něco', 'mezi', 'kdyby', 'všude', 'mezi', 'přes', 'kolem', 'podle', 'okolo', 'vedle', 'proti',
  'ode', 'ke', 'nade', 'pode', 'přede', 'ob', 'my', 'vy', 'on', 'ona', 'ono', 'oni', 'ony', 'jej', 'jemu', 'nám', 'vám',
  'jim', 'jich', 'nás', 'vás', 'mě', 'mne', 'mně', 'tě', 'tebe', 'ti', 'ty', 'si', 'mi', 'sebe', 'sám', 'sama', 'samo',
]);

// --- Zvláštní slova s pevným rozborem (krátká, často používaná) ----------------------------------------------
export const SPECIAL = new Map([
  ['by', ['b']], ['aby', ['b']], ['kdyby', ['b']], ['abych', ['b']], ['abys', ['b']], ['abychom', ['b']], ['abyste', ['b']],
  ['my', ['m']], ['mi', ['m']], ['vy', ['v']], ['si', ['s']], ['brzy', ['z']],
  ['ti', ['palatal']], ['ty', ['hard']], ['ni', ['palatal']],
]);

// --- Vyjmenovaná slova a příbuzná: kmeny s y/ý (podřetězce slov). Ne-vyjmenovaná slova s i/í po stejné
//     souhlásce se pozná tím, že žádný kmen nepokrývá dané místo. ---------------------------------------------
export const LIST_STEMS = {
  b: ['být', 'byt', 'byl', 'bydl', 'byst', 'býk', 'býc', 'bylin', 'obyv', 'obyč', 'nábytek', 'dobytek', 'kobyl', 'bývat', 'zbýt', 'pobýt', 'přebýt', 'zbyt', 'pobyt', 'Bydžov', 'bydž', 'býv', 'nabýt'],
  l: ['slyš', 'slyc', 'mlýn', 'mlyn', 'blýsk', 'blysk', 'blyšt', 'polyk', 'polýk', 'plyn', 'plýt', 'plyt', 'vzlyk', 'lyž', 'lys', 'lýk', 'lyk', 'slyn', 'plyš', 'blýsk'],
  m: ['myš', 'myl', 'mýl', 'myt', 'mýt', 'mysl', 'mýd', 'hmyz', 'hymn', 'mykat', 'mýkat', 'myč', 'chmýř', 'myj', 'umýv', 'umyv', 'smýk', 'smyk', 'zamyk', 'odemyk', 'mýtin'],
  p: ['pyt', 'pýcha', 'pých', 'pyš', 'pysk', 'pyl', 'kopyt', 'klopýt', 'netopýr', 'slepýš', 'třpyt', 'třepyt', 'čepýř', 'pýř', 'pykat', 'pýr'],
  s: ['syn', 'syt', 'sýt', 'sýr', 'syk', 'syč', 'sych', 'sýk', 'sysl', 'sysel', 'syp', 'sýp', 'syr', 'sýč', 'sychr', 'usych', 'osych', 'nasyt', 'sypk'],
  v: ['vysok', 'vyso', 'výt', 'vyje', 'vyjí', 'vytí', 'výsk', 'vydr', 'výr', 'výhe', 'vyžl', 'zvyk', 'žvýk', 'povyk', 'vykat', 'vykán', 'zvýk', 'zvykn', 'žvyk'],
  z: ['brzy', 'jazyk', 'jazyč', 'zýv', 'zyv', 'Ruzyn', 'ruzyn'],
};

// Předpona vy-/vý- není vyjmenované slovo; slova s ní se v knihovně nepoužívají (pravidlo není v taxonomii).
export const VY_PREFIX = /^v[yý]/;

// Slova končící na -l/-la/-lo/-li/-ly, která NEJSOU minulé sloveso (jinak je třeba označit shodu/minulý čas).
// Jen podstatná jména a pod.; každé sem patří až po zvážení.
export const NOT_VERB = new Set([
  'stůl', 'úl', 'sůl', 'kůl', 'hůl', 'kolo', 'škola', 'sklo', 'mýdlo', 'světlo', 'křídlo', 'peklo', 'zrcadlo', 'dělo', 'zlo',
  'hotel', 'pytel', 'anděl', 'orel', 'osel', 'kotel', 'uzel', 'kostel', 'ocel', 'karel', 'pavel', 'michal', 'emil',
  'sál', 'val', 'dílo', 'pól', 'čelo', 'tělo', 'hala', 'skála', 'pila', 'vila', 'víla', 'kapela', 'nula', 'cela', 'koala',
  'málo', 'polo', 'ohnivo', 'divadlo', 'divadla', 'cíl', 'král', 'pytel', 'pyl', 'pila', 'síla', 'sídlo', 'sysel', 'penál', 'teplo', 'postel', 'umývadlo', 'mysl', 'obyvatel', 'kobyla', 'bidlo', 'žíla', 'cihla', 'cihel', 'žížala', 'tykadlo', 'jídlo', 'kyvadlo', 'úhel', 'půl', 'úkol', 'máslo', 'letadlo', 'tunel', 'včela', 'učitel', 'učitelka', 'tabula', 'hrnek', 'sokol', 'datel', 'pastel',
  'slavík', 'zámek', 'kabela', 'kapela', 'žárovka', 'tužka', 'pohár', 'oltář', 'ostrov', 'kmotřenec', 'šála', 'aula',
  'kuchyňka', 'stodola', 'kopule', 'kulka', 'bota', 'pila', 'skála', 'hala', 'lampa', 'mula', 'lopata', 'lopatka',
]);

// Slova s předponou s-/z-/vz-: pod 6. ročníkem se nepoužívají (předpony nejsou v taxonomii dříve).
// Seznam je jen pojistka pro nejběžnější případy, ne úplný soupis.
export const PREFIX_SZ_WORDS = new Set([
  'smazat', 'smazal', 'smazala', 'sbalit', 'sbalil', 'sbírat', 'sbíral', 'sbírka', 'sjet', 'sjel', 'sjela', 'skočit', 'skočil',
  'zbalit', 'zbalil', 'zkazit', 'zkazil', 'zmizet', 'zmizel', 'zmizela', 'zhasnout', 'zhasl', 'zhasla', 'zvednout', 'zvedl',
  'zvedla', 'zmrzlina', 'zlepšit', 'zjistit', 'zjistil', 'zahrát', 'zbourat', 'zbourali', 'vzít', 'vzal', 'vzala', 'vzali',
  'vzdát', 'vzduch', 'vzdálený', 'vzpomenout', 'vzpomínka', 'vzhůru', 'vzorný', 'vzor', 'zdvořilý', 'zdvihnout', 'zhoršit',
]);

// Slovní tvary s koncovým -i/-y po d/t/n, které jsou pevné (ne volba podle vzoru).
// Přidány i jednoznačné slovesné tvary 3. osoby (-dí/-tí/-ní): slovesná koncovka je vždy -í, nejde o volbu podle vzoru.
export const FIXED_FORMS = new Set(['děti', 'ti', 'ty', 'ni', 'sedí', 'chodí', 'hodí', 'platí', 'hladí', 'honí', 'zvoní', 'voní', 'letí', 'sní', 'zní', 'tati', 'řekni', 'čti', 'jdi', 'pojď']);
