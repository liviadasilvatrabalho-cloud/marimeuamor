import { pool, STATE_ID, getAppState, saveAppState } from '../db';
import { syncAppStateToDatabase } from '../src/normalize';

async function testDatabaseSaving() {
  if (!pool) {
    console.error('DATABASE_URL ausente');
    process.exit(1);
  }

  console.log('🧪 Testando persistência no banco Neon Postgres...');

  // 1. Ler estado atual
  const initial = await getAppState();
  console.log('✓ Estado inicial lido. User:', initial?.user?.name);
  if (initial?.user?.name !== 'Mari') {
    throw new Error(`Esperado nome Mari, recebido: ${initial?.user?.name}`);
  }

  // 2. Adicionar uma nova refeição (slot)
  const newSlot = {
    id: 'slot_pre_treino',
    label: 'Pré-Treino',
    timeHint: '15:30 - 16:00',
    icon: '🏋️‍♀️',
  };

  const updatedSlots = [...(initial.mealSlots || []), newSlot];
  const stateWithNewSlot = {
    ...initial,
    mealSlots: updatedSlots,
  };

  await saveAppState(stateWithNewSlot);
  console.log('✓ Nova refeição salva no Neon Postgres via saveAppState');

  // 3. Verificar persistência imediata
  const reloaded1 = await getAppState();
  const foundSlot = reloaded1?.mealSlots?.find((s: any) => s.id === 'slot_pre_treino');
  if (!foundSlot) {
    throw new Error('Falha: slot_pre_treino não foi encontrado após salvar no banco!');
  }
  console.log(`✓ Slot persistido com sucesso: "${foundSlot.label}" (${foundSlot.icon})`);

  // 4. Testar exclusão da refeição
  const filteredSlots = reloaded1.mealSlots.filter((s: any) => s.id !== 'slot_pre_treino');
  const stateAfterDelete = {
    ...reloaded1,
    mealSlots: filteredSlots,
  };
  await saveAppState(stateAfterDelete);
  console.log('✓ Exclusão da refeição salva no Neon Postgres');

  // 5. Verificar que foi removido
  const reloaded2 = await getAppState();
  const deletedSlot = reloaded2?.mealSlots?.find((s: any) => s.id === 'slot_pre_treino');
  if (deletedSlot) {
    throw new Error('Falha: slot_pre_treino ainda existe após exclusão!');
  }
  console.log('✓ Slot excluído com sucesso e persistência confirmada.');

  // 6. Testar syncAppStateToDatabase com perfil da Mari
  const syncResult = await syncAppStateToDatabase(reloaded2, '33333333-3333-3333-3333-333333333333');
  console.log('✓ Sync de tabelas normalizadas:', syncResult.ok ? 'SUCESSO' : syncResult.reason);

  console.log('\n🎉 SUCESSO: O BANCO DE DADOS NEON POSTGRES ESTÁ SALVANDO E PERSISTINDO CORRETAMENTE!');
  await pool.end();
  process.exit(0);
}

testDatabaseSaving().catch((err) => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
