import React, { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import MoreIcon from '@mui/icons-material/MoreVert';
import FilterIcon from '@mui/icons-material/FilterList';
import PersonIcon from '@mui/icons-material/Person';
import BuildIcon from '@mui/icons-material/Build';
import InventoryIcon from '@mui/icons-material/Inventory';
import CarIcon from '@mui/icons-material/DirectionsCar';
import { Resource, ResourceType, deleteResource } from '../../services/jobService';
import { format } from 'date-fns';

interface ResourceListProps {
  resources: Resource[];
  onEdit: (resource: Resource) => void;
  onRefresh: () => void;
}

export default function ResourceList({ resources, onEdit, onRefresh }: ResourceListProps) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMenuAnchor, setActionMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  
  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleOpenActionMenu = (event: React.MouseEvent<HTMLElement>, resource: Resource) => {
    setActionMenuAnchor(event.currentTarget);
    setSelectedResource(resource);
  };

  const handleCloseActionMenu = () => {
    setActionMenuAnchor(null);
    setSelectedResource(null);
  };

  const handleEditClick = () => {
    if (selectedResource) {
      onEdit(selectedResource);
      handleCloseActionMenu();
    }
  };

  const handleDeleteClick = async () => {
    if (selectedResource) {
      try {
        if (window.confirm(`Are you sure you want to delete ${selectedResource.name}?`)) {
          await deleteResource(selectedResource.id);
          onRefresh();
        }
      } catch (error) {
        console.error('Error deleting resource:', error);
        alert('Failed to delete resource. It may be in use on one or more jobs.');
      }
      handleCloseActionMenu();
    }
  };

  const getResourceTypeIcon = (type: ResourceType) => {
    switch (type) {
      case 'employee':
        return <PersonIcon fontSize="small" />;
      case 'equipment':
        return <BuildIcon fontSize="small" />;
      case 'material':
        return <InventoryIcon fontSize="small" />;
      case 'vehicle':
        return <CarIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    switch (status) {
      case 'available':
        return 'success';
      case 'unavailable':
        return 'error';
      case 'partially_available':
        return 'warning';
      case 'scheduled':
        return 'info';
      case 'out_of_service':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredResources = resources.filter(resource => 
    resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resource.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resource.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (resource.description && resource.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const displayedResources = filteredResources
    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
        <TextField
          variant="outlined"
          placeholder="Search resources..."
          size="small"
          fullWidth
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ maxWidth: 400 }}
        />
        <IconButton sx={{ ml: 1 }} aria-label="filter list">
          <FilterIcon />
        </IconButton>
      </Box>

      <TableContainer>
        <Table aria-label="resource table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Tags</TableCell>
              <TableCell>Last Updated</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedResources.length > 0 ? (
              displayedResources.map((resource) => (
                <TableRow key={resource.id} hover>
                  <TableCell component="th" scope="row">
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {getResourceTypeIcon(resource.type)}
                      <Typography sx={{ ml: 1 }}>
                        {resource.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={resource.type} 
                      size="small" 
                      color={
                        resource.type === 'employee' ? 'primary' :
                        resource.type === 'equipment' ? 'secondary' :
                        resource.type === 'material' ? 'info' : 'success'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={resource.status.replace('_', ' ')} 
                      size="small" 
                      color={getStatusColor(resource.status)}
                    />
                  </TableCell>
                  <TableCell>
                    {resource.description || '-'}
                  </TableCell>
                  <TableCell>
                    {resource.tags && resource.tags.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {resource.tags.map((tag, index) => (
                          <Chip key={index} label={tag} size="small" variant="outlined" />
                        ))}
                      </Box>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {format(new Date(resource.updated_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton onClick={() => onEdit(resource)} size="small">
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <IconButton 
                      aria-label="more"
                      size="small"
                      onClick={(e) => handleOpenActionMenu(e, resource)}
                    >
                      <MoreIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  {searchTerm ? (
                    <Typography variant="body1">
                      No resources match your search criteria
                    </Typography>
                  ) : (
                    <Typography variant="body1">
                      No resources available
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={filteredResources.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      <Menu
        anchorEl={actionMenuAnchor}
        open={Boolean(actionMenuAnchor)}
        onClose={handleCloseActionMenu}
      >
        <MenuItem onClick={handleEditClick}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
} 