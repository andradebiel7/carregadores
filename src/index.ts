import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO FATAL: Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.');
  process.exit(1);
}

const METADATA_URL = 'https://api.tupinambaenergia.com.br/stations';
const STATUS_URL = 'https://api.tupinambaenergia.com.br/stationsShortVersion';

const TELEGRAM_TOKEN = '8512644919:AAEosg5DCEiou-3IBFzZV4k0ObBkOYtYmGA';
const TELEGRAM_CHAT_ID = '1498248093';

// Supabase client com timeout de 30s para evitar travamento quando o banco estiver lento
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: {
    fetch: async (url: string | URL | Request, options: RequestInit = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    }
  }
});

const API_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': 'https://www.tupinambaenergia.com.br',
  'Referer': 'https://www.tupinambaenergia.com.br/'
};

const CITY_TO_STATE: Record<string, string> = {
  'São Paulo': 'SP', 'Mogi das Cruzes': 'SP', 'Guarulhos': 'SP', 'Campinas': 'SP', 'Santos': 'SP', 'Marília': 'SP', 'Assis': 'SP', 'Bauru': 'SP', 'Jundiaí': 'SP', 'Piracicaba': 'SP', 'Ribeirão Preto': 'SP', 'São José dos Campos': 'SP', 'Sorocaba': 'SP', 'Barueri': 'SP', 'São Caetano do Sul': 'SP', 'São Bernardo do Campo': 'SP', 'Santo André': 'SP', 'Osasco': 'SP', 'São José do Rio Preto': 'SP', 'Araraquara': 'SP', 'Franca': 'SP', 'Limeira': 'SP', 'Sumaré': 'SP', 'Taboão da Serra': 'SP', 'Embu das Artes': 'SP',
  'Rio de Janeiro': 'RJ', 'Niterói': 'RJ', 'Búzios': 'RJ', 'Angra dos Reis': 'RJ', 'Petrópolis': 'RJ', 'Duque de Caxias': 'RJ', 'São Gonçalo': 'RJ', 'Nova Iguaçu': 'RJ', 'Macaé': 'RJ', 'Cabo Frio': 'RJ',
  'Belo Horizonte': 'MG', 'Uberlândia': 'MG', 'Contagem': 'MG', 'Nova Lima': 'MG', 'Juiz de Fora': 'MG', 'Betim': 'MG', 'Montes Claros': 'MG', 'Ribeirão das Neves': 'MG', 'Uberaba': 'MG', 'Governador Valadares': 'MG',
  'Curitiba': 'PR', 'Londrina': 'PR', 'Maringá': 'PR', 'Cascavel': 'PR', 'Foz do Iguaçu': 'PR', 'Ponta Grossa': 'PR', 'São José dos Pinhais': 'PR', 'Colombo': 'PR', 'Guarapuava': 'PR',
  'Porto Alegre': 'RS', 'Caxias do Sul': 'RS', 'Gramado': 'RS', 'Canela': 'RS', 'Canoas': 'RS', 'Pelotas': 'RS', 'Santa Maria': 'RS', 'Gravataí': 'RS', 'Viamão': 'RS', 'Novo Hamburgo': 'RS',
  'Florianópolis': 'SC', 'Joinville': 'SC', 'Blumenau': 'SC', 'Balneário Camboriú': 'SC', 'Itajaí': 'SC', 'São José': 'SC', 'Chapecó': 'SC', 'Criciúma': 'SC',
  'Goiânia': 'GO', 'Anápolis': 'GO', 'Aparecida de Goiânia': 'GO', 'Rio Verde': 'GO',
  'Brasília': 'DF',
  'Salvador': 'BA', 'Feira de Santana': 'BA', 'Vitória da Conquista': 'BA', 'Camaçari': 'BA', 'Itabuna': 'BA', 'Juazeiro': 'BA',
  'Fortaleza': 'CE', 'Caucaia': 'CE', 'Juazeiro do Norte': 'CE', 'Maracanaú': 'CE',
  'Recife': 'PE', 'Jaboatão dos Guararapes': 'PE', 'Olinda': 'PE', 'Caruaru': 'PE', 'Petrolina': 'PE',
  'Natal': 'RN', 'Mossoró': 'RN',
  'João Pessoa': 'PB', 'Campina Grande': 'PB',
  'Maceió': 'AL', 'Aracaju': 'SE', 'Teresina': 'PI', 'São Luís': 'MA',
  'Belém': 'PA', 'Ananindeua': 'PA', 'Santarém': 'PA',
  'Manaus': 'AM', 'Porto Velho': 'RO', 'Boa Vista': 'RR', 'Macapá': 'AP', 'Rio Branco': 'AC', 'Palmas': 'TO', 'Cuiabá': 'MT', 'Várzea Grande': 'MT', 'Campo Grande': 'MS', 'Dourados': 'MS', 'Vitória': 'ES', 'Vila Velha': 'ES', 'Serra': 'ES', 'Cariacica': 'ES'
};

// ============================================================
// UTILS: Retry com Backoff
// ============================================================
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delays = [2000, 5000, 10000]): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) return res;

      if (attempt < retries && res.status >= 500) {
        console.log(`LOG: Tentativa ${attempt + 1} falhou (status ${res.status}). Aguardando ${delays[attempt]}ms...`);
        await new Promise(r => setTimeout(r, delays[attempt]));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        console.log(`LOG: Tentativa ${attempt + 1} falhou (${(err as Error).message}). Aguardando ${delays[attempt]}ms...`);
        await new Promise(r => setTimeout(r, delays[attempt]));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Todas as tentativas de fetch falharam');
}

// ============================================================
// UTILS: Telegram Anti-Spam
// ============================================================
async function sendTelegramAlert(text: string): Promise<void> {
  try {
    const { data: lastError } = await supabase
      .from('monitoramento')
      .select('timestamp')
      .eq('estacao_id', '_SYSTEM_ERROR_')
      .order('timestamp', { ascending: false })
      .limit(1);

    const now = new Date();
    if (lastError && lastError.length > 0) {
      const lastErrorTime = new Date(lastError[0].timestamp);
      const diffMinutes = (now.getTime() - lastErrorTime.getTime()) / (1000 * 60);
      if (diffMinutes < 30) {
        console.log('LOG: Alerta Telegram suprimido (último envio < 30 min atrás).');
        return;
      }
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' })
    });

    await supabase.from('monitoramento').insert({
      estacao_id: '_SYSTEM_ERROR_',
      nome: 'SYSTEM',
      status: 'error_alert_sent',
      timestamp: now.toISOString()
    });
  } catch (telegramErr) {
    console.error('LOG ERROR: Falha ao enviar alerta no Telegram', telegramErr);
  }
}

// ============================================================
// FALLBACK: Carregar metadados do cache (banco) quando API cai
// ============================================================
async function loadCachedMetadata(): Promise<Map<string, any>> {
  console.log('LOG: Usando metadados do cache (banco de dados)...');
  const { data, error } = await supabase
    .from('stations')
    .select('id, city, state, neighborhood, power, tarifa_venda');

  if (error || !data) {
    throw new Error('Falha ao carregar metadados do cache: ' + (error?.message || 'sem dados'));
  }

  const metaMap = new Map<string, any>();
  data.forEach((m: any) => {
    metaMap.set(m.id, {
      city: m.city || 'Desconhecido',
      state: m.state || 'BR',
      neighborhood: m.neighborhood || null,
      power: m.power,
      tarifa_venda: Number(m.tarifa_venda) || 0
    });
  });
  console.log(`LOG: Cache carregado com ${metaMap.size} estações.`);
  return metaMap;
}

// ============================================================
// FUNÇÃO PRINCIPAL DE INGESTÃO
// ============================================================
async function runIngestion(): Promise<void> {
  const startTime = Date.now();
  console.log(`\n[${new Date().toLocaleString('pt-BR')}] LOG: Ingestão de Precisão iniciada.`);

  let metaMap: Map<string, any>;
  let usedFallback = false;

  // 1 & 2. Fetch Metadata e Status (Concorrente)
  console.log('LOG: Buscando metadados e status simultaneamente...');
  const [metaResSettled, statusResSettled] = await Promise.allSettled([
    fetchWithRetry(METADATA_URL, { headers: API_HEADERS }, 1, [2000]),
    fetchWithRetry(STATUS_URL, { headers: API_HEADERS })
  ]);

  // Processar Metadados
  if (metaResSettled.status === 'fulfilled' && metaResSettled.value.ok) {
    const allMeta = await metaResSettled.value.json() as any[];
    metaMap = new Map<string, any>();
    allMeta.forEach((m: any) => {
      if (m._id) {
        metaMap.set(m._id, {
          city: m.address2?.city || 'Desconhecido',
          state: m.address2?.state || 'BR',
          neighborhood: m.address2?.neighborhood || null,
          power: m.power,
          tarifa_venda: (m.paymentCharge?.value / 100) || 0
        });
      }
    });
    console.log(`LOG: Mapeados ${metaMap.size} metadados da API.`);
  } else {
    const reason = metaResSettled.status === 'rejected'
      ? (metaResSettled.reason as Error).message
      : `Status ${(metaResSettled as PromiseFulfilledResult<Response>).value.status}`;
    console.warn(`LOG WARN: API Metadata indisponível (${reason}). Usando cache...`);
    metaMap = await loadCachedMetadata();
    usedFallback = true;
  }

  // Processar Status
  let stations: any[];
  if (statusResSettled.status === 'fulfilled' && statusResSettled.value.ok) {
    stations = await statusResSettled.value.json() as any[];
    console.log(`LOG: Recebidos ${stations.length} carregadores ativos.`);
  } else {
    const reason = statusResSettled.status === 'rejected'
      ? (statusResSettled.reason as Error).message
      : `Status ${(statusResSettled as PromiseFulfilledResult<Response>).value.status}`;
    throw new Error(`API Status falhou: ${reason}`);
  }

  // Buscar status atual das estações no banco para otimização de I/O
  console.log('LOG: Buscando status atual das estações no banco para otimização de I/O...');
  const { data: currentStationsData, error: currentStationsError } = await supabase
    .from('stations')
    .select('id, status');

  const dbStatusMap = new Map<string, string>();
  if (!currentStationsError && currentStationsData) {
    currentStationsData.forEach((s: any) => {
      dbStatusMap.set(s.id, s.status || '');
    });
    console.log(`LOG: Mapeados ${dbStatusMap.size} status atuais do banco para comparação.`);
  } else {
    console.warn('LOG WARN: Falha ao buscar status atuais do banco. Otimização de I/O ignorada nesta execução.');
  }

  const stationMetadata: any[] = [];
  const statusLogs: any[] = [];
  const hourlyStatsPayload: any[] = [];
  const now = new Date().toISOString();

  // Calcula Horário de Brasília (UTC-3)
  const brTime = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
  const dataStr = brTime.toISOString().split('T')[0];
  const currentHour = brTime.getUTCHours();

  for (const s of stations) {
    const meta = metaMap.get(s._id) || { city: 'Desconhecido', state: 'BR', neighborhood: null, power: null, tarifa_venda: 0 };

    const stationPower = meta.power || (s.connectedPlugs && s.connectedPlugs[0]?.power) || null;

    // Inteligência de Cidade
    let finalCity = meta.city;
    if (finalCity === 'Desconhecido' || !finalCity) {
      const name = s.name || '';
      const cityMatch = Object.keys(CITY_TO_STATE).find(city => name.includes(city));
      if (cityMatch) finalCity = cityMatch;
    }

    const liveStatus = s.stateName || '';

    stationMetadata.push({
      id: s._id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      city: finalCity,
      state: (finalCity && CITY_TO_STATE[finalCity]) || meta.state,
      neighborhood: meta.neighborhood,
      status: liveStatus || 'Available',
      power: stationPower,
      tarifa_venda: meta.tarifa_venda,
      updated_at: now
    });

    // Só registrar log se houver mudança de status
    const st = s.stateName || '';
    const previousSt = dbStatusMap.has(s._id) ? dbStatusMap.get(s._id) : null;

    if (st && st !== previousSt) {
      statusLogs.push({
        estacao_id: s._id,
        nome: s.name,
        status: st,
        timestamp: now
      });
    }

    // Lógica de Agregação Horária
    let busy = 0;
    let available = 0;
    let offline = 0;
    let faturamento = 0;

    if (['Charging', 'Finishing', 'Reserved', 'Preparing'].includes(st)) {
      busy = 5;
      const kw = meta.power || (s.connectedPlugs && s.connectedPlugs[0]?.power) || 0;
      const price = meta.tarifa_venda || 0;
      faturamento = (5 / 60) * kw * price;
      if (!isFinite(faturamento)) faturamento = 0;
    } else if (st === 'Available' || st === 'Disponível' || st === '') {
      available = 5;
    } else {
      offline = 5;
    }

    if (busy > 0 || available > 0 || offline > 0) {
      hourlyStatsPayload.push({
        estacao_id: s._id,
        data: dataStr,
        hora: currentHour,
        busy,
        available,
        offline,
        faturamento: Number(faturamento.toFixed(4)),
        custo: 0,
        status_name: st || 'Available'
      });
    }
  }

  // 3. Upsert de estações (chunks de 100)
  console.log(`LOG: Iniciando upsert de ${stationMetadata.length} estações...`);
  const fastChunkSize = 100;

  for (let i = 0; i < stationMetadata.length; i += fastChunkSize) {
    const chunk = stationMetadata.slice(i, i + fastChunkSize);
    const { error } = await supabase.rpc('smart_upsert_stations', { payload: chunk });
    if (error) throw error;
  }

  // 4. Logs de monitoramento (chunks de 100)
  for (let i = 0; i < statusLogs.length; i += fastChunkSize) {
    const chunk = statusLogs.slice(i, i + fastChunkSize);
    const { error } = await supabase.from('monitoramento').insert(chunk);
    if (error) throw error;
  }

  console.log('LOG: Estações e logs atualizados com sucesso.');

  // 5. Estatísticas horárias (chunks de 100 — reduzido para evitar lentidão)
  console.log('LOG: Atualizando estatísticas horárias...');
  const rpcChunkSize = 100;
  for (let i = 0; i < hourlyStatsPayload.length; i += rpcChunkSize) {
    const chunk = hourlyStatsPayload.slice(i, i + rpcChunkSize);
    const { error: rpcError } = await supabase.rpc('batch_increment_hourly_stats', { payload: chunk });
    if (rpcError) {
      console.warn(`LOG WARN: Chunk RPC ${i} falhou (${rpcError.message}). Continuando...`);
    }
  }
  console.log('LOG: Processamento de estatísticas horárias finalizado.');

  // 6. Cleanup (registros > 24 horas — roda 1x por hora para economizar Disk IO)
  const brTimeNow = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
  if (brTimeNow.getUTCMinutes() < 10) { // só roda nos primeiros 10 min de cada hora
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    await supabase.from('monitoramento').delete().lt('timestamp', oneDayAgo.toISOString());
    console.log('LOG: Cleanup de monitoramento executado (registros > 24h removidos).');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const msg = usedFallback
    ? `⚠️ Ingestão OK (fallback). Estações: ${stationMetadata.length}. Tempo: ${elapsed}s`
    : `✅ Ingestão OK. Estações: ${stationMetadata.length}. Tempo: ${elapsed}s`;
  console.log('LOG: ' + msg);
}

// ============================================================
// CRON: Executa a cada 5 minutos
// ============================================================
console.log('🚀 Tupi Ingestion Service iniciado. Aguardando próxima execução...');

// Executa imediatamente ao iniciar
runIngestion().catch(async (error) => {
  console.error('LOG ERROR: Fatal error na execução inicial', error);
  const text = `🚨 *Tupi Monitoramento ERRO* 🚨\n\nA rotina de ingestão (${new Date().toLocaleString('pt-BR')}) falhou.\n\n*Detalhes:*\n\`${(error as Error).message}\``;
  await sendTelegramAlert(text);
});

// Agenda execução a cada 10 minutos
cron.schedule('*/10 * * * *', async () => {
  try {
    await runIngestion();
  } catch (error) {
    console.error('LOG ERROR: Fatal error no cron', error);
    const text = `🚨 *Tupi Monitoramento ERRO* 🚨\n\nA rotina de ingestão (${new Date().toLocaleString('pt-BR')}) falhou.\n\n*Detalhes:*\n\`${(error as Error).message}\``;
    await sendTelegramAlert(text);
  }
});
