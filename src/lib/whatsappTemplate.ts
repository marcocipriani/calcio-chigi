import { format, subMinutes, isToday, isTomorrow } from 'date-fns';
import { it } from 'date-fns/locale';
import { buildMatchMessage } from '@/lib/formations';
import { isMatchEvent, isU35At } from '@/lib/utils';
import type { EventType } from '@/lib/types';

type WhatsAppEvent = {
    data_ora: string | null;
    tipo: EventType;
    squadra_casa?: string | null;
    squadra_ospite?: string | null;
    avversario?: string | null;
    luogo?: string | null;
};

type WhatsAppAttendance = {
    status?: string | null;
    profiles?: {
        nome?: string | null;
        cognome?: string | null;
        ruolo?: string | null;
        data_nascita?: string | null;
        is_staff?: boolean;
    } | null;
};

export function genMsgWhatsApp(evento: WhatsAppEvent, presenze: WhatsAppAttendance[]) {
    if (!evento.data_ora) return 'Evento senza data: impossibile generare il messaggio.';

    const presenti = presenze.flatMap(({ status, profiles }) =>
        status === 'PRESENTE' && profiles ? [profiles] : []);

    // Partita senza formazione pubblicata: stesso formato, convocati = chi ha risposto presente.
    if (isMatchEvent(evento.tipo)) {
        return buildMatchMessage(
            evento,
            // Lo staff presente alla partita non è un convocato.
            presenti.filter((profilo) => !profilo.is_staff).map((profilo) => ({
                nome: profilo.nome ?? '',
                cognome: profilo.cognome ?? '',
                role: profilo.ruolo,
                birthDate: profilo.data_nascita,
            })),
            { lineup: false },
        );
    }

    const dataEvento = new Date(evento.data_ora);
    const dataFormattata = format(dataEvento, 'EEEE d MMMM', { locale: it });
    const orarioInizio = format(dataEvento, 'HH:mm');
    const orarioRitrovo = format(subMinutes(dataEvento, 60), 'HH:mm');

    const portieri: string[] = [];
    const under35: string[] = [];
    const over35: string[] = [];

    presenti.forEach(profilo => {
        const nomeCompleto = `${profilo.nome || ''} ${profilo.cognome || ''}`.trim();

        if (profilo.ruolo?.toUpperCase() === 'PORTIERE') portieri.push(nomeCompleto);
        else if (isU35At(profilo.data_nascita, dataEvento)) under35.push(nomeCompleto);
        else over35.push(nomeCompleto);
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

    if (presenti.length === 0) {
        listaConvocati += `Ancora nessun convocato confermato.\n\n`;
    }

    let saluto = "Ci vediamo al campo! 💪";
    if (isToday(dataEvento)) saluto = "Ci vediamo stasera! 💪";
    else if (isTomorrow(dataEvento)) saluto = "Ci vediamo domani! 💪";

    return `🏃‍♂️ INFO ALLENAMENTO per ${dataFormattata}

📍 DOVE E QUANDO:
Ritrovo ore ${orarioRitrovo} a ${evento.luogo || 'campo da definire'}
Inizio allenamento ore ${orarioInizio}
${listaConvocati}${saluto}`;
}
