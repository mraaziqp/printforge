import * as THREE from 'three';

/**
 * Generates an ASCII STL string from a THREE.BufferGeometry
 */
export function exportGeometryToStlAscii(geometry: THREE.BufferGeometry, name = 'PrintForge_Model'): string {
  // Ensure we have position and normal attributes
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return '';

  let normalAttr = geometry.getAttribute('normal');
  if (!normalAttr) {
    geometry.computeVertexNormals();
    normalAttr = geometry.getAttribute('normal');
  }

  const index = geometry.getIndex();
  let stl = `solid ${name.replace(/[^a-zA-Z0-9_-]/g, '_')}\n`;

  const getVertex = (i: number): [number, number, number] => {
    return [posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)];
  };

  const getNormal = (i: number): [number, number, number] => {
    if (!normalAttr) return [0, 0, 1];
    return [normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)];
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);

      const norm = getNormal(a);
      const vA = getVertex(a);
      const vB = getVertex(b);
      const vC = getVertex(c);

      stl += `  facet normal ${norm[0].toExponential(6)} ${norm[1].toExponential(6)} ${norm[2].toExponential(6)}\n`;
      stl += `    outer loop\n`;
      stl += `      vertex ${vA[0].toPrecision(6)} ${vA[1].toPrecision(6)} ${vA[2].toPrecision(6)}\n`;
      stl += `      vertex ${vB[0].toPrecision(6)} ${vB[1].toPrecision(6)} ${vB[2].toPrecision(6)}\n`;
      stl += `      vertex ${vC[0].toPrecision(6)} ${vC[1].toPrecision(6)} ${vC[2].toPrecision(6)}\n`;
      stl += `    endloop\n`;
      stl += `  endfacet\n`;
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      const a = i;
      const b = i + 1;
      const c = i + 2;

      const norm = getNormal(a);
      const vA = getVertex(a);
      const vB = getVertex(b);
      const vC = getVertex(c);

      stl += `  facet normal ${norm[0].toExponential(6)} ${norm[1].toExponential(6)} ${norm[2].toExponential(6)}\n`;
      stl += `    outer loop\n`;
      stl += `      vertex ${vA[0].toPrecision(6)} ${vA[1].toPrecision(6)} ${vA[2].toPrecision(6)}\n`;
      stl += `      vertex ${vB[0].toPrecision(6)} ${vB[1].toPrecision(6)} ${vB[2].toPrecision(6)}\n`;
      stl += `      vertex ${vC[0].toPrecision(6)} ${vC[1].toPrecision(6)} ${vC[2].toPrecision(6)}\n`;
      stl += `    endloop\n`;
      stl += `  endfacet\n`;
    }
  }

  stl += `endsolid ${name.replace(/[^a-zA-Z0-9_-]/g, '_')}\n`;
  return stl;
}

/**
 * Triggers a browser download of an STL file
 */
export function triggerStlDownload(geometry: THREE.BufferGeometry, filename = 'printforge_mesh.stl') {
  const stlContent = exportGeometryToStlAscii(geometry, filename.replace(/\.stl$/i, ''));
  const blob = new Blob([stlContent], { type: 'application/sla' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.stl') ? filename : `${filename}.stl`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
