/* Pirates Tools — Configuration des paiements crypto
 * --------------------------------------------------
 * Tout est statique, aucun backend requis. Remplis simplement
 * tes adresses ci-dessous. Les acheteurs verront le QR + l'adresse,
 * pourront copier en un clic, et le total sera converti automatiquement
 * depuis EUR vers la crypto choisie via CoinGecko (API publique gratuite).
 *
 * Pour ajouter / retirer un réseau, édite le tableau NETWORKS.
 * - id          : identifiant interne (libre, alphanumérique)
 * - label       : nom affiché à l'utilisateur
 * - symbol      : ticker (BTC, ETH, USDT, USDC, SOL, BNB, MATIC, LTC, TRX…)
 * - chain       : libellé court du réseau ("Bitcoin", "Ethereum (ERC-20)", "Tron (TRC-20)"…)
 * - address     : TON adresse de réception
 * - coingeckoId : id CoinGecko utilisé pour convertir EUR→crypto.
 *                 Liste : https://api.coingecko.com/api/v3/coins/list
 *                 BTC=bitcoin, ETH=ethereum, USDT=tether, USDC=usd-coin,
 *                 SOL=solana, BNB=binancecoin, MATIC=matic-network, TRX=tron
 * - decimals    : nombre de décimales d'affichage (8 pour BTC, 6 pour USDT/USDC, 4 pour ETH/SOL…)
 * - uriScheme   : schéma de l'URI de paiement pour le QR. Laisser '' pour ne pas en utiliser.
 *
 * IMPORTANT : double-vérifie chaque adresse avant publication. Une faute = fonds perdus.
 */
window.PT_CRYPTO_CONFIG = {
  // Adresse(s) de réception (MetaMask multi-chaînes).
  networks: [
    {
      id: 'btc',
      label: 'Bitcoin',
      symbol: 'BTC',
      chain: 'Bitcoin',
      address: 'bc1qfh9zdgq598xc3vgsrnyp2v38pefcxz827kwxwx',
      coingeckoId: 'bitcoin',
      decimals: 8,
      uriScheme: 'bitcoin:'
    },
    {
      id: 'eth',
      label: 'Ethereum',
      symbol: 'ETH',
      chain: 'Ethereum (mainnet)',
      address: '0xbF61CB5850754c3A87bEb696E3f0607718ad6b08',
      coingeckoId: 'ethereum',
      decimals: 6,
      uriScheme: 'ethereum:'
    },
    {
      id: 'arb-eth',
      label: 'ETH (Arbitrum)',
      symbol: 'ETH',
      chain: 'Arbitrum One',
      address: '0xbF61CB5850754c3A87bEb696E3f0607718ad6b08',
      coingeckoId: 'ethereum',
      decimals: 6,
      uriScheme: ''
    },
    {
      id: 'arb-usdc',
      label: 'USDC (Arbitrum)',
      symbol: 'USDC',
      chain: 'Arbitrum One',
      address: '0xbF61CB5850754c3A87bEb696E3f0607718ad6b08',
      coingeckoId: 'usd-coin',
      decimals: 2,
      uriScheme: ''
    },
    {
      id: 'arb-usdt',
      label: 'USDT (Arbitrum)',
      symbol: 'USDT',
      chain: 'Arbitrum One',
      address: '0xbF61CB5850754c3A87bEb696E3f0607718ad6b08',
      coingeckoId: 'tether',
      decimals: 2,
      uriScheme: ''
    },
    {
      id: 'sol',
      label: 'Solana',
      symbol: 'SOL',
      chain: 'Solana',
      address: 'GKVmgduLmvVtqvds8oXsH4UFxmkbAVT2om4bXBo2eQbu',
      coingeckoId: 'solana',
      decimals: 4,
      uriScheme: 'solana:'
    }
  ],

  // ── Paiement par CARTE BANCAIRE → crypto (on-ramp tiers) ──
  // Sans backend, on redirige vers un portail hébergé par un prestataire
  // qui se charge du KYC, du paiement carte, et envoie la crypto sur TON
  // adresse. Plusieurs options gratuites (sans frais fixes) :
  //
  //  • NOWPayments (recommandé) : crée une "Invoice" depuis ton dashboard
  //    https://account.nowpayments.io/  → copie l'URL ici.
  //    Tu peux aussi générer une URL dynamique via leur API si tu ajoutes
  //    une clé API ; dans ce cas remplis "nowpaymentsApiKey".
  //
  //  • MoonPay / Transak : widgets URL signés, payants/limités sans backend.
  //
  //  • Lien fixe vers ton portail Coinbase Commerce / BitPay / Binance Pay.
  //
  // Si tu ne mets rien, le bouton "Payer par carte" affichera un message
  // expliquant que ce mode n'est pas encore configuré.
  cardCheckout: {
    // URL hébergée d'invoice/checkout (statique). Ex :
    // 'https://nowpayments.io/payment/?iid=XXXXXXXXX'
    // 'https://commerce.coinbase.com/checkout/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
    url: '',

    // Optionnel : clé API NOWPayments (publique côté client OK pour les
    // endpoints "create invoice" en mode sandbox/limité). Si fournie,
    // l'app crée dynamiquement une invoice avec le total du panier.
    nowpaymentsApiKey: '',

    // Devise d'encaissement chez le prestataire (la crypto reçue).
    // Ex : 'usdttrc20', 'btc', 'usdc'…
    nowpaymentsPayCurrency: 'usdttrc20'
  },

  // Numéro WhatsApp (international, sans +, ni espace) pour confirmer
  // un paiement crypto effectué (envoi du txid). Ex: '590690123456'
  whatsappNumber: '590774230195'
};
