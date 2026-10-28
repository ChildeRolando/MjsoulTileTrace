from pathlib import Path
HERE=Path(__file__).resolve().parent
source=(HERE.parent/'b25-109167/run.py').read_text(encoding='utf-8')
for before,after in [('109167','224232'),("'109'","'224'"),("'167'","'232'"),('==76','==77'),('coac269-exact-224232/1','coac269-exact224232/1')]:source=source.replace(before,after)
(HERE/'run.py').write_text(source,encoding='utf-8',newline='\n')
source=(HERE.parent/'b25-109167/verify-pack.py').read_text(encoding='utf-8')
for before,after in [("'109'","'224'"),("'167'","'232'"),('==30','==32'),('==76','==77'),("'runtimeFilesRehashed':30","'runtimeFilesRehashed':32"),("'preflightChecks':76","'preflightChecks':77")]:source=source.replace(before,after)
(HERE/'verify-pack.py').write_text(source,encoding='utf-8',newline='\n')
