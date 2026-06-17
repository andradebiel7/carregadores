import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const METADATA_URL = "https://api.tupinambaenergia.com.br/stations";
const STATUS_URL = "https://api.tupinambaenergia.com.br/stationsShortVersion";

const TELEGRAM_TOKEN = "8512644919:AAEosg5DCEiou-3IBFzZV4k0ObBkOYtYmGA";
const TELEGRAM_CHAT_ID = "1498248093";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const API_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Origin": "https://www.tupinambaenergia.com.br",
  "Referer": "https://www.tupinambaenergia.com.br/"
};

const CITY_TO_STATE: Record<string, string> = {
  "São Paulo": "SP", "Mogi das Cruzes": "SP", "Guarulhos": "SP", "Campinas": "SP", "Santos": "SP", "Marília": "SP", "Assis": "SP", "Bauru": "SP", "Jundiaí": "SP", "Piracicaba": "SP", "Ribeirão Preto": "SP", "São José dos Campos": "SP", "Sorocaba": "SP", "Barueri": "SP", "São Caetano do Sul": "SP", "São Bernardo do Campo": "SP", "Santo André": "SP", "Osasco": "SP", "São José do Rio Preto": "SP", "Araraquara": "SP", "Franca": "SP", "Limeira": "SP", "Sumaré": "SP", "Taboão da Serra": "SP", "Embu das Artes": "SP",
  "Rio de Janeiro": "RJ", "Niterói": "RJ", "Búzios": "RJ", "Angra dos Reis": "RJ", "Petrópolis": "RJ", "Duque de Caxias": "RJ", "São Gonçalo": "RJ", "Nova Iguaçu": "RJ", "Macaé": "RJ", "Cabo Frio": "RJ",
  "Belo Horizonte": "MG", "Uberlândia": "MG", "Contagem": "MG", "Nova Lima": "MG", "Juiz de Fora": "MG", "Betim": "MG", "Montes Claros": "MG", "Ribeirão das Neves": "MG", "Uberaba": "MG", "Governador Valadares": "MG",
  "Curitiba": "PR", "Londrina": "PR", "Maringá": "PR", "Cascavel": "PR", "Foz do Iguaçu": "PR", "Ponta Grossa": "PR", "São José dos Pinhais": "PR", "Colombo": "PR", "Guarapuava": "PR",
  "Porto Alegre": "RS", "Caxias do Sul": "RS", "Gramado": "RS", "Canela": "RS", "Canoas": "RS", "Pelotas": "RS", "Santa Maria": "RS", "Gravataí": "RS", "Viamão": "RS", "Novo Hamburgo": "RS",
  "Florianópolis": "SC", "Joinville": "SC", "Blumenau": "SC", "Balneário Camboriú": "SC", "Itajaí": "SC", "São José": "SC", "Chapecó": "SC", "Criciúma": "SC",
  "Goiânia": "GO", "Anápolis": "GO", "Aparecida de Goiânia": "GO", "Rio Verde": "GO",
  "Brasília": "DF",
  "Salvador": "BA", "Feira de Santana": "BA", "Vitória da Conquista": "BA", "Camaçari": "BA", "Itabuna": "BA", "Juazeiro": "BA",
  "Fortaleza": "CE", "Caucaia": "CE", "Juazeiro do Norte": "CE", "Maracanaú": "CE",
  "Recife": "PE", "Jaboatão dos Guararapes": "PE", "Olinda": "PE", "Caruaru": "PE", "Petrolina": "PE",
  "Natal": "RN", "Mossoró": "RN",
  "João Pessoa": "PB", "Campina Grande": "PB",
  "Maceió": "AL", "Aracaju": "SE", "Teresina": "PI", "São Luís": "MA",
  "Belém": "PA", "Ananindeua": "PA", "Santarém": "PA",
  "Manaus": "AM", "Porto Velho": "RO", "Boa Vista": "RR", "Macapá": "AP", "Rio Branco": "AC", "Palmas": "TO", "Cuiabá": "MT", "Várzea Grande": "MT", "Campo Grande": "MS", "Dourados": "MS", "Vitória": "ES", "Vila Velha": "ES", "Serra": "ES", "Cariacica": "ES"
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

      // Se não é a última tentativa e o erro é recuperável (5xx), retry
      if (attempt < retries && res.status >= 500) {
        console.log(`LOG: Tentativa ${attempt + 1} falhou (status ${res.status}). Aguardando ${delays[attempt]}ms...`);
        await new Promise(r => setTimeout(r, delays[attempt]));
        continue;
      }
      return res; // Retorna a resposta com erro para ser tratada pelo caller
    } catch (err) {
      if (attempt < retries) {
        console.log(`LOG: Tentativa ${attempt + 1} falhou (${(err as Error).message}). Aguardando ${delays[attempt]}ms...`);
        await new Promise(r => setTimeout(r, delays[attempt]));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Todas as tentativas de fetch falharam");
}

// ============================================================
// UTILS: Telegram Anti-Spam
// ============================================================
async function sendTelegramAlert(text: string) {
  try {
    // Verificar última mensagem de erro para evitar spam
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
        console.log("LOG: Alerta Telegram suprimido (último envio < 30 min atrás).");
        return;
      }
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" })
    });

    // Registrar timestamp do erro para anti-spam
    await supabase.from('monitoramento').insert({
      estacao_id: '_SYSTEM_ERROR_',
      nome: 'SYSTEM',
      status: 'error_alert_sent',
      timestamp: now.toISOString()
    });
  } catch (telegramErr) {
    console.error("LOG ERROR: Falha ao enviar alerta no Telegram", telegramErr);
  }
}

// ============================================================
// FALLBACK: Carregar metadados do cache (banco) quando API cai
// ============================================================
async function loadCachedMetadata(): Promise<Map<string, any>> {
  console.log("LOG: Usando metadados do cache (banco de dados)...");
  const { data, error } = await supabase
    .from('stations')
    .select('id, city, state, neighborhood, power, tarifa_venda');

  if (error || !data) {
    throw new Error("Falha ao carregar metadados do cache: " + (error?.message || "sem dados"));
  }

  const metaMap = new Map();
  data.forEach((m: any) => {
    metaMap.set(m.id, {
      city: m.city || "Desconhecido",
      state: m.state || "BR",
      neighborhood: m.neighborhood || null,
      power: m.power,
      tarifa_venda: Number(m.tarifa_venda) || 0
    });
  });
  console.log(`LOG: Cache carregado com ${metaMap.size} estações.`);
  return metaMap;
}

Deno.serve(async (req) => {
  try {
    console.log("LOG: Ingestão de Precisão iniciada.");
    let metaMap: Map<string, any>;
    let usedFallback = false;

    // 1 & 2. Fetch Metadata and Status (Concorrente para economizar tempo)
    console.log("LOG: Buscando metadados e status simultaneamente...");
    const [metaResSettled, statusResSettled] = await Promise.allSettled([
      fetchWithRetry(METADATA_URL, { headers: API_HEADERS }, 1, [2000]), // Reduzido retries para evitar timeout global
      fetchWithRetry(STATUS_URL, { headers: API_HEADERS })
    ]);

    // Processar Metadados
    if (metaResSettled.status === "fulfilled" && metaResSettled.value.ok) {
      const allMeta = await metaResSettled.value.json();
      metaMap = new Map();
      allMeta.forEach((m: any) => {
        if (m._id) {
          metaMap.set(m._id, {
            city: m.address2?.city || "Desconhecido",
            state: m.address2?.state || "BR",
            neighborhood: m.address2?.neighborhood || null,
            power: m.power,
            tarifa_venda: (m.paymentCharge?.value / 100) || 0
          });
        }
      });
      console.log(`LOG: Mapeados ${metaMap.size} metadados da API.`);
    } else {
      const reason = metaResSettled.status === "rejected" ? metaResSettled.reason.message : `Status ${metaResSettled.value.status}`;
      console.warn(`LOG WARN: API Metadata indisponível (${reason}). Usando cache...`);
      metaMap = await loadCachedMetadata();
      usedFallback = true;
    }

    // Processar Status
    let stations: any[];
    if (statusResSettled.status === "fulfilled" && statusResSettled.value.ok) {
      stations = await statusResSettled.value.json();
      console.log(`LOG: Recebidos ${stations.length} carregadores ativos.`);
    } else {
      const reason = statusResSettled.status === "rejected" ? statusResSettled.reason.message : `Status ${statusResSettled.value.status}`;
      throw new Error(`API Status falhou: ${reason}`);
    }

    // OTIMIZAÇÃO DE I/O: Buscar status atual das estações no banco para filtrar logs de monitoramento
    console.log("LOG: Buscando status atual das estações no banco para otimização de I/O...");
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
      console.warn("LOG WARN: Falha ao buscar status atuais do banco. Otimização de I/O ignorada nesta execução.");
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
      const meta = metaMap.get(s._id) || { city: "Desconhecido", state: "BR", neighborhood: null, power: null, tarifa_venda: 0 };

      // Fallback para power se não houver no meta (pegar do status)
      const stationPower = meta.power || (s.connectedPlugs && s.connectedPlugs[0]?.power) || null;

      // Inteligência de Cidade: Se cidade for desconhecida, tenta extrair do nome
      let finalCity = meta.city;
      if (finalCity === "Desconhecido" || !finalCity) {
        const name = s.name || "";
        if (name.includes("Mogi das Cruzes")) finalCity = "Mogi das Cruzes";
        else if (name.includes("São Paulo")) finalCity = "São Paulo";
        else if (name.includes("Rio de Janeiro")) finalCity = "Rio de Janeiro";
        else if (name.includes("Curitiba")) finalCity = "Curitiba";
        else if (name.includes("Belo Horizonte")) finalCity = "Belo Horizonte";
        else if (name.includes("Brasília")) finalCity = "Brasília";
        else if (name.includes("Porto Alegre")) finalCity = "Porto Alegre";
        else if (name.includes("Salvador")) finalCity = "Salvador";
        else if (name.includes("Fortaleza")) finalCity = "Fortaleza";
        else if (name.includes("Recife")) finalCity = "Recife";
        else if (name.includes("Goiânia")) finalCity = "Goiânia";
        else if (name.includes("Manaus")) finalCity = "Manaus";
        else if (name.includes("Vitória")) finalCity = "Vitória";
        else if (name.includes("Florianópolis")) finalCity = "Florianópolis";
        else if (name.includes("Cuiabá")) finalCity = "Cuiabá";
        else if (name.includes("Campo Grande")) finalCity = "Campo Grande";
        else if (name.includes("Natal")) finalCity = "Natal";
        else if (name.includes("João Pessoa")) finalCity = "João Pessoa";
        else if (name.includes("Teresina")) finalCity = "Teresina";
        else if (name.includes("Aracaju")) finalCity = "Aracaju";
        else if (name.includes("Maceió")) finalCity = "Maceió";
        else if (name.includes("São Luís")) finalCity = "São Luís";
        else if (name.includes("Belém")) finalCity = "Belém";
        else if (name.includes("Porto Velho")) finalCity = "Porto Velho";
        else if (name.includes("Boa Vista")) finalCity = "Boa Vista";
        else if (name.includes("Macapá")) finalCity = "Macapá";
        else if (name.includes("Rio Branco")) finalCity = "Rio Branco";
        else if (name.includes("Palmas")) finalCity = "Palmas";
      }

      // Determinar status: usar o da API se disponível, caso contrário manter o existente
      const liveStatus = s.stateName || '';

      stationMetadata.push({
        id: s._id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        city: finalCity,
        state: (finalCity && CITY_TO_STATE[finalCity]) || meta.state,
        neighborhood: meta.neighborhood,
        status: liveStatus || 'Available', // NUNCA enviar vazio — default 'Available'
        power: stationPower,
        tarifa_venda: meta.tarifa_venda,
        updated_at: now
      });

      // Só registrar log se tiver status real E se for diferente do status salvo no banco
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

      if (["Charging", "Finishing", "Reserved", "Preparing"].includes(st)) {
        busy = 5;
        const dbFallback = metaMap.get(s._id);
        const kw = meta.power || (dbFallback ? dbFallback.power : null) || (s.connectedPlugs && s.connectedPlugs[0]?.power) || 0;
        const price = meta.tarifa_venda || (dbFallback ? dbFallback.tarifa_venda : 0) || 0;
        
        faturamento = (5 / 60) * kw * price;
        // Proteção contra NaN/Infinity
        if (!isFinite(faturamento)) faturamento = 0;
      } else if (st === "Available" || st === "Disponível" || st === '') {
        available = 5;
      } else {
        offline = 5;
      }

      // Removida a restrição que ignorava dados de estações disponíveis/offline
      // Todas as estações precisam reportar para o cálculo correto das médias de disponibilidade
      if (busy > 0 || available > 0 || offline > 0) {
        hourlyStatsPayload.push({
          estacao_id: s._id,
          data: dataStr,
          hora: currentHour,
          busy: busy,
          available: available,
          offline: offline,
          faturamento: Number(faturamento.toFixed(4)),
          custo: 0,
          status_name: st || 'Available'
        });
      }
    }

    // 3 e 4. Operações de Banco Rápidas (Sequencial para evitar lock contention)
    console.log(`LOG: Iniciando upsert de estações e logs...`);
    const fastChunkSize = 100;

    // Chunks para Stations usando Smart Upsert
    for (let i = 0; i < stationMetadata.length; i += fastChunkSize) {
      const chunk = stationMetadata.slice(i, i + fastChunkSize);
      const { error } = await supabase.rpc('smart_upsert_stations', { payload: chunk });
      if (error) throw error;
    }

    // Chunks para Monitoramento
    for (let i = 0; i < statusLogs.length; i += fastChunkSize) {
      const chunk = statusLogs.slice(i, i + fastChunkSize);
      const { error } = await supabase.from('monitoramento').insert(chunk);
      if (error) throw error;
    }

    console.log("LOG: Estações e logs atualizados com sucesso.");

    // 4.5. Operações de Banco Lentas (Sequencial para evitar statement timeout e congestionamento)
    console.log("LOG: Atualizando estatísticas horárias com a nova função refatorada...");
    const rpcChunkSize = 200; // Aumentado para 200 para compensar a remoção do filtro que ignorava as estações Available
    for (let i = 0; i < hourlyStatsPayload.length; i += rpcChunkSize) {
      const chunk = hourlyStatsPayload.slice(i, i + rpcChunkSize);
      const { error: rpcError } = await supabase.rpc('batch_increment_hourly_stats', { payload: chunk });
      if (rpcError) {
        console.warn(`LOG WARN: Chunk RPC ${i} falhou (${rpcError.message}). Continuando...`);
      }
    }
    console.log("LOG: Processamento de estatísticas horárias finalizado.");

    // 5. Cleanup (Registros > 12 horas — hourly_stats já agrega)
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);
    await supabase.from('monitoramento').delete().lt('timestamp', twelveHoursAgo.toISOString());

    const msg = usedFallback
      ? `⚠️ Ingestão OK (fallback). Estações: ${stationMetadata.length}. API Metadata indisponível.`
      : `✅ Ingestão OK. Estações: ${stationMetadata.length}`;
    console.log("LOG: " + msg);

    return new Response(JSON.stringify({ success: true, count: stationMetadata.length, fallback: usedFallback }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("LOG ERROR: Fatal error", error);

    const text = `🚨 *Tupi Monitoramento ERRO* 🚨\n\nA rotina de ingestão de dados (${new Date().toLocaleString('pt-BR')}) falhou.\n\n*Detalhes do erro:*\n\`${(error as Error).message}\``;
    await sendTelegramAlert(text);

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
