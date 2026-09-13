(function(root){
 const staff=['admin','dispatcher'];
 const rules={
  board:[...staff,'carrier-owner'],planning:[...staff,'carrier-owner'],operations:staff,
  assign:[...staff,'carrier-owner'],invoice:[...staff,'carrier-owner','broker'],
  documents:[...staff,'carrier-owner','broker','shipper'],verifyBroker:[...staff,'carrier-owner'],
  billing:['admin','carrier-owner','broker','shipper'],carrier:[...staff,'carrier-owner'],
  broker:[...staff,'broker'],shipper:[...staff,'shipper'],staff,admin:['admin']
 };
 const pages={'loadboard.html':'board','planning-tools.html':'planning','tms.html':'operations','square-billing.html':'billing','admin.html':'admin','intake-review.html':'staff'};
 const allowed=(role,feature)=>Boolean(rules[feature]?.includes(role));
 const planAllowed=(role,plan)=>role==='admin'||(role==='carrier-owner'&&/^dispatch-(basic|standard|premium)$/.test(plan))||(role==='broker'&&plan==='broker')||(role==='shipper'&&plan==='shipper');
 const api={allowed,pages,planAllowed}; if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HarperPermissions=api;
})(typeof window!=='undefined'?window:this);
