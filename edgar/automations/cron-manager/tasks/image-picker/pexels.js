import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';

import { createClient } from 'pexels';

console.log('CWD:', process.cwd());
console.log('KEY:', process.env.PEXELS_API_KEY ? 'OK' : 'MISSING');

const client = createClient(process.env.PEXELS_API_KEY);

const run = async () => {
  try {
    const res = await client.photos.search({
      query: 'travel',
      per_page: 10
    });

    // 🔍 Verifica se veio imagem
    if (!res.photos || res.photos.length === 0) {
      console.log('Nenhuma imagem encontrada.');
      return;
    }

    const photo = res.photos[0];

    console.log('\n📸 Primeira imagem encontrada:');
    console.log(`ID: ${photo.id}`);
    console.log(`Autor: ${photo.photographer}`);

    // 🧾 Mostra TODAS as opções de download
    console.log('\n🧾 SRC (todas as resoluções disponíveis):');
    console.log(JSON.stringify(photo.src, null, 2));

    // 📥 Escolhe a melhor qualidade
    const imageUrl = photo.src.original;

    console.log('\n⬇️ Baixando imagem...');
    console.log(imageUrl);

    // 📥 Download (Node 18+ já tem fetch)
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();

    // 📁 Cria pasta
    fs.mkdirSync('images', { recursive: true });

    const filePath = `images/image-${photo.id}.jpg`;

    fs.writeFileSync(filePath, Buffer.from(buffer));

    console.log(`\n✅ Imagem salva em: ${filePath}`);

  } catch (err) {
    console.error('Erro:', err.message);
  }
};

run();
