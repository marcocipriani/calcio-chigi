import { format, subMinutes, differenceInYears, isToday, isTomorrow } from 'date-fns';
import { it } from 'date-fns/locale';

type WhatsAppEvent = {
    data_ora: string | null;
    tipo: 'PARTITA' | 'ALLENAMENTO';
    squadra_casa?: string | null;
    squadra_ospite?: string | null;
    luogo?: string | null;
};

type WhatsAppAttendance = {
    status?: string | null;
    profiles?: {
        nome?: string | null;
        cognome?: string | null;
        ruolo?: string | null;
        data_nascita?: string | null;
    } | null;
};

export function genMsgWhatsApp(evento: WhatsAppEvent, presenze: WhatsAppAttendance[]) {
    const dataEvento = new Date(evento.data_ora ?? 0);
    const isPartita = evento.tipo === 'PARTITA';
    
    let avversario = '';
    let inCasa = false;
    
    if (isPartita) {
        if (evento.squadra_casa?.toLowerCase().includes('chigi')) {
            avversario = evento.squadra_ospite ?? '';
            inCasa = true;
        } else {
            avversario = evento.squadra_casa ?? '';
            inCasa = false;
        }
    }

    const dataFormattata = format(dataEvento, 'EEEE d MMMM', { locale: it });
    const orarioInizio = format(dataEvento, 'HH:mm');
    const orarioRitrovo = format(subMinutes(dataEvento, 60), 'HH:mm');

    const header = isPartita 
        ? `⚽ INFO PARTITA per ${dataFormattata} vs ${avversario}` 
        : `🏃‍♂️ INFO ALLENAMENTO per ${dataFormattata}`;

    const infoLuogo = isPartita 
        ? `Ritrovo ore ${orarioRitrovo} a ${evento.luogo || 'campo da definire'} ${inCasa ? '(giochiamo in casa)' : '(trasferta)'}` 
        : `Ritrovo ore ${orarioRitrovo} a ${evento.luogo || 'campo da definire'}`;
        
    const infoInizio = isPartita 
        ? `Calcio d’inizio ore ${orarioInizio}` 
        : `Inizio allenamento ore ${orarioInizio}`;

    const divisa = isPartita 
        ? `\n🔵🔷 DIVISA:\nMaglia azzurra e pantaloncino blu\n` 
        : ``;

    const portieri: string[] = [];
    const under35: string[] = [];
    const over35: string[] = [];

    presenze.forEach(presenza => {
        if (presenza.status !== 'PRESENT') return;
        
        const profilo = presenza.profiles;
        if (!profilo) return;
        
        const nomeCompleto = `${profilo.nome || ''} ${profilo.cognome || ''}`.trim();
        
        if (profilo.ruolo?.toUpperCase() === 'PORTIERE') {
            portieri.push(nomeCompleto);
        } else {
            let isUnder = false;
            if (profilo.data_nascita) {
                const eta = differenceInYears(new Date(), new Date(profilo.data_nascita));
                if (eta < 35) isUnder = true;
            }
            
            if (isUnder) under35.push(nomeCompleto);
            else over35.push(nomeCompleto);
        }
    });

    let listaConvocati = `\n📋 CONVOCATI:\n\n`;
    
    if (over35.length > 0) {
        listaConvocati += over35.join('\n') + '\n\n';
    }
    if (under35.length > 0) {
        listaConvocati += `Under 35:\n${under35.join('\n')}\n\n`;
    }
    if (portieri.length > 0) {
        listaConvocati += `Portieri:\n${portieri.join('\n')}\n\n`;
    }

    if (over35.length === 0 && under35.length === 0 && portieri.length === 0) {
        listaConvocati += `Ancora nessun convocato confermato.\n\n`;
    }

    let saluto = "Ci vediamo al campo! 💪";
    if (isToday(dataEvento)) saluto = "Ci vediamo stasera! 💪";
    else if (isTomorrow(dataEvento)) saluto = "Ci vediamo domani! 💪";

    return `${header}

📍 DOVE E QUANDO:
${infoLuogo}
${infoInizio}
${divisa}${listaConvocati}${saluto}`;
}
